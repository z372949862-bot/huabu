// Electron 30 net.fetch feeds Chromium's decoded response headers straight into
// WHATWG Headers. A UTF-8 filename in Content-Disposition can throw *outside* its
// promise, crashing the main process. Use the same Chromium network/proxy stack
// through net.request and restore non-ByteString values to their UTF-8 bytes.
function byteString(value) {
  const text = String(value)
  return /[^\x00-\xff]/.test(text) ? Buffer.from(text, 'utf8').toString('latin1') : text
}

function createMediaFetch(net) {
  return async function mediaFetch(input, init) {
    const request = new Request(input, init)
    if (!['http:', 'https:'].includes(new URL(request.url).protocol)) throw new TypeError('Unsupported media URL protocol')
    const signal = request.signal
    if (signal.aborted) throw signal.reason || new DOMException('The operation was aborted', 'AbortError')
    return new Promise((resolve, reject) => {
      let client, bodyController, uploadReader
      let finished = false
      const cleanup = () => signal.removeEventListener('abort', onAbort)
      function fail(error) {
        if (finished) return
        finished = true
        cleanup()
        reject(error)
        if (bodyController) bodyController.error(error)
        if (uploadReader) void uploadReader.cancel(error).catch(() => {})
        if (client) client.abort()
      }
      function onAbort() { fail(signal.reason || new DOMException('The operation was aborted', 'AbortError')) }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        client = net.request({ url: request.url, method: request.method, redirect: request.redirect })
        client.on('error', fail)
        client.on('abort', () => fail(new DOMException('The operation was aborted', 'AbortError')))
        client.on('response', response => {
          if (finished) return
          try {
            const headers = new Headers()
            for (const [name, values] of Object.entries(response.headers)) {
              for (const value of Array.isArray(values) ? values : [values]) headers.append(name, byteString(value))
            }
            const hasBody = request.method !== 'HEAD' && ![204, 205, 304].includes(response.statusCode)
            const body = hasBody ? new ReadableStream({
              start(controller) { bodyController = controller },
              cancel() {
                if (finished) return
                finished = true
                cleanup()
                client.abort()
              },
            }) : null
            const result = new Response(body, { status: response.statusCode, statusText: byteString(response.statusMessage || ''), headers })
            // IncomingMessage is an Electron EventEmitter, not a Node Readable.
            // Register end before data, as required by Electron's stream API.
            response.on('error', fail)
            response.on('aborted', () => fail(new TypeError('Media response was interrupted')))
            response.on('end', () => {
              if (finished) return
              finished = true
              cleanup()
              if (bodyController) bodyController.close()
            })
            response.on('data', chunk => {
              if (!finished && bodyController) bodyController.enqueue(new Uint8Array(chunk))
            })
            resolve(result)
          } catch (error) { fail(error) }
        })
        for (const [name, value] of request.headers) client.setHeader(name, value)
        // Request serializes FormData with its matching boundary. Do not use a
        // fixed multipart header or pass any provider credentials to staging/CDN.
        void (async () => {
          try {
            if (request.body) {
              uploadReader = request.body.getReader()
              while (!finished) {
                const { done, value } = await uploadReader.read()
                if (done || finished) break
                await new Promise(resolveWrite => client.write(Buffer.from(value), resolveWrite))
              }
            }
            if (!finished) client.end()
          } catch (error) { fail(error) }
          finally { if (uploadReader) uploadReader.releaseLock() }
        })()
      } catch (error) { fail(error) }
    })
  }
}

module.exports = { createMediaFetch }
