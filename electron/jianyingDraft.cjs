// -*- coding: utf-8 -*-
// 生成剪映专业版可打开的「明文」草稿（已验证 10.x 可读未加密草稿）。
// 把时间轴片段（含 trim 入/出点、顺序）写成一条视频轨道。
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// 剪映草稿根目录
function draftRoot() {
  const local = process.env.LOCALAPPDATA || ''
  return path.join(local, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft')
}
function isInstalled() {
  try { return fs.existsSync(draftRoot()) } catch { return false }
}

function uid() {
  // 形如 UUID 大写
  const h = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1).toUpperCase()
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`
}

// 用 ffmpeg 解析视频宽高与时长（秒）。ffmpeg-static 无 ffprobe，故解析 stderr。
function probe(ffmpeg, file) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let s = ''
    proc.stderr.on('data', d => { s += d.toString() })
    proc.on('close', () => {
      let w = 0, h = 0, dur = 0
      const m = s.match(/(\d{2,5})x(\d{2,5})/)
      if (m) { w = parseInt(m[1]); h = parseInt(m[2]) }
      const dm = s.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      if (dm) dur = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3])
      resolve({ width: w || 1280, height: h || 720, duration: dur })
    })
    proc.on('error', () => resolve({ width: 1280, height: 720, duration: 0 }))
  })
}

module.exports = { draftRoot, isInstalled, uid, probe }
// PLACEHOLDER_BUILD

// 构造单个视频素材对象
function makeVideoMaterial(id, localPath, name, w, h, durUs) {
  return {
    audio_fade: null, category_id: '', category_name: 'local', check_flag: 63487,
    crop: { lower_left_x: 0.0, lower_left_y: 1.0, lower_right_x: 1.0, lower_right_y: 1.0,
      upper_left_x: 0.0, upper_left_y: 0.0, upper_right_x: 1.0, upper_right_y: 0.0 },
    crop_ratio: 'free', crop_scale: 1.0, duration: durUs, extra_type_option: 0, formula_id: '',
    freeze: null, has_audio: true, height: h, id, intensifies_audio_path: '', intensifies_path: '',
    is_ai_generate_content: false, is_copyright: false, is_text_edit_overdub: false,
    is_unified_beauty_mode: false, local_id: '', local_material_id: '', material_id: '',
    material_name: name, material_url: '',
    matting: { flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: '', strokes: [] },
    media_path: '', object_locked: null, origin_material_id: '', path: localPath, picture_from: 'none',
    picture_set_category_id: '', picture_set_category_name: '', request_id: '',
    reverse_intensifies_path: '', reverse_path: '', smart_motion: null, source: 0, source_platform: 0,
    stable: null, team_id: '', type: 'video',
    video_algorithm: { algorithms: [], complement_frame_config: null, deflicker: null, gameplay_configs: [],
      motion_blur_config: null, noise_reduction: null, path: '', quality_enhance: null, time_range: null },
    width: w,
  }
}

// 构造一个片段的轨道 segment（含 trim 与时间轴位置、单片段音量）
function makeSegment(id, matId, refs, srcStartUs, segDurUs, tlStartUs, volume = 1.0) {
  const vol = Math.max(0, Math.min(1, Number(volume == null ? 1 : volume)))
  return {
    caption_info: null, cartoon: false,
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0,
      scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    common_keyframes: [], enable_adjust: true, enable_color_curves: true, enable_color_match_adjust: false,
    enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false,
    extra_material_refs: refs, group_id: '', hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    id, intensifies_audio: false, is_placeholder: false, is_tone_modify: false, keyframe_refs: [],
    last_nonzero_volume: vol > 0 ? vol : 1.0, material_id: matId, render_index: 0,
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 },
    reverse: false, source_timerange: { duration: segDurUs, start: srcStartUs }, speed: 1.0,
    target_timerange: { duration: segDurUs, start: tlStartUs }, template_id: '', template_scene: 'default',
    track_attribute: 0, track_render_index: 0, uniform_scale: { on: true, value: 1.0 }, visible: true, volume: vol,
  }
}
// PLACEHOLDER_DRAFT

// 主流程：clips=[{localPath,name,trimStart,trimEnd}], 每个 localPath 已是本地可读文件
async function buildDraft({ name, clips, ffmpeg }) {
  if (!isInstalled()) throw new Error('未检测到剪映专业版（草稿目录不存在）')
  if (!clips || !clips.length) throw new Error('没有可导出的片段')
  const root = draftRoot()
  const folder = path.join(root, name)
  const resDir = path.join(folder, 'Resources', 'videos')
  fs.mkdirSync(resDir, { recursive: true })

  const draftId = uid()
  const materials = []
  const segments = []
  const speeds = [], placeholders = [], canvases = [], soundMaps = []
  let timelineUs = 0
  let canvasW = 0, canvasH = 0

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]
    const info = await probe(ffmpeg, c.localPath)
    if (!canvasW) { canvasW = info.width; canvasH = info.height }
    // 把素材复制进草稿 Resources（剪映需文件长期存在）
    const ext = (path.extname(c.localPath) || '.mp4').toLowerCase()
    const finalPath = path.join(resDir, `clip_${i}${ext}`)
    try { fs.copyFileSync(c.localPath, finalPath) } catch { /* 已是本地原文件也行 */ }
    const fullDur = info.duration || 0
    const ts = Math.max(0, Number(c.trimStart) || 0)
    const te = Number(c.trimEnd) > 0 ? Number(c.trimEnd) : fullDur
    const segSec = te > ts ? te - ts : (fullDur || 1)
    const durUs = Math.round((fullDur || segSec) * 1e6)
    const srcStartUs = Math.round(ts * 1e6)
    const segDurUs = Math.round(segSec * 1e6)

    const matId = uid(), segId = uid(), spdId = uid(), phId = uid(), cvId = uid(), scId = uid()
    materials.push(makeVideoMaterial(matId, finalPath.replace(/\//g, '\\'), `clip_${i}${ext}`, info.width, info.height, durUs))
    speeds.push({ curve_speed: null, id: spdId, mode: 0, speed: 1.0, type: 'speed' })
    placeholders.push({ error_path: '', error_text: '', id: phId, meta_type: 'none', res_path: '', res_text: '', type: 'placeholder_info' })
    canvases.push({ album_image: '', blur: 0.0, color: '', id: cvId, image: '', image_id: '', image_name: '', source_platform: 0, type: 'canvas_color' })
    soundMaps.push({ audio_channel_mapping: 0, id: scId, is_config_open: false, type: 'none' })
    segments.push(makeSegment(segId, matId, [spdId, phId, cvId, scId], srcStartUs, segDurUs, timelineUs, c.volume == null ? 1 : c.volume))
    timelineUs += segDurUs
  }

  const plat = { app_id: 3704, app_source: 'lv', app_version: '10.7.0', device_id: 'avc', hard_disk_id: '', mac_address: '', os: 'windows' }
  const content = {
    canvas_config: { height: canvasH || 720, width: canvasW || 1280, ratio: 'original' },
    color_space: 0,
    config: { adjust_max_index: 1, lyrics_recognition_id: '', maintrack_adsorb: true, multi_language_current: 'none', subtitle_keywords_config: null },
    cover: null, create_time: 0, duration: timelineUs, extra_info: null, fps: 30.0,
    free_render_index_mode_on: false, group_container: null, id: draftId, keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: plat,
    materials: {
      audios: [], canvases, chromas: [], color_curves: [], digital_humans: [], drafts: [], effects: [],
      flowers: [], green_screens: [], handwrites: [], hsl: [], images: [], log_color_wheels: [], loudnesses: [],
      manual_deformations: [], masks: [], material_animations: [], material_colors: [], multi_language_refs: [],
      placeholders, plugin_effects: [], primary_color_wheels: [], realtime_denoises: [], shapes: [], smart_crops: [],
      smart_relights: [], sound_channel_mappings: soundMaps, speeds, stickers: [], tail_leaders: [], text_templates: [],
      texts: [], time_marks: [], transitions: [], video_effects: [], video_trackings: [], vocal_beautifys: [],
      vocal_separations: [], videos: materials,
    },
    mutable_config: null, name: '', new_version: '110.0.0', platform: plat, relationships: [],
    render_index_track_mode_on: true, retouch_cover: null, source: 'default', static_cover_image_path: '',
    time_marks: null,
    tracks: [{ attribute: 0, flag: 0, id: uid(), is_default_name: true, name: '', segments, type: 'video' }],
    update_time: 0, version: 360000,
  }
  const nowUs = Date.now() * 1000
  const meta = {
    cloud_package_completed_time: '', draft_cloud_capcut_purchase_info: '', draft_cloud_last_action_download: false,
    draft_cloud_purchase_info: '', draft_cloud_template_id: '', draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '', draft_cover: 'draft_cover.jpg', draft_deeplink_url: '',
    draft_enterprise_info: { draft_enterprise_extra: '', draft_enterprise_id: '', draft_enterprise_name: '', enterprise_material: [] },
    draft_fold_path: folder.replace(/\//g, '\\'), draft_id: draftId, draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false, draft_is_ai_translate: false, draft_is_article_video_draft: false,
    draft_is_from_deeplink: 'false', draft_is_invisible: false, draft_materials: [], draft_materials_copied_info: [],
    draft_name: name, draft_new_version: '', draft_removable_storage_device: '',
    draft_root_path: root.replace(/\//g, '\\'), draft_segment_extra_info: [], draft_timeline_materials_size_: 0,
    draft_type: '', tm_draft_cloud_completed: '', tm_draft_cloud_modified: 0, tm_draft_create: nowUs,
    tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: timelineUs,
  }
  fs.writeFileSync(path.join(folder, 'draft_content.json'), JSON.stringify(content), 'utf-8')
  fs.writeFileSync(path.join(folder, 'draft_meta_info.json'), JSON.stringify(meta), 'utf-8')

  // 注册进 root_meta_info.json（先备份）
  const rootMeta = path.join(root, 'root_meta_info.json')
  try { if (fs.existsSync(rootMeta) && !fs.existsSync(rootMeta + '.avcbak')) fs.copyFileSync(rootMeta, rootMeta + '.avcbak') } catch {}
  let reg = { all_draft_store: [], draft_ids: [], root_path: root.replace(/\//g, '\\') }
  try { reg = JSON.parse(fs.readFileSync(rootMeta, 'utf-8')) } catch {}
  const entry = {
    cloud_draft_cover: false, cloud_draft_sync: false, draft_cloud_last_action_download: false,
    draft_cloud_purchase_info: '', draft_cloud_template_id: '', draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '', draft_cover: path.join(folder, 'draft_cover.jpg').replace(/\//g, '\\'),
    draft_fold_path: folder.replace(/\//g, '\\'), draft_id: draftId, draft_is_ai_shorts: false,
    draft_is_cloud_temp_draft: false, draft_is_invisible: false, draft_is_web_article_video: false,
    draft_json_file: path.join(folder, 'draft_content.json').replace(/\//g, '\\'), draft_name: name,
    draft_new_version: '', draft_root_path: root.replace(/\//g, '\\'), draft_timeline_materials_size: 0,
    draft_type: '', draft_web_article_video_enter_from: '', streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: '', tm_draft_cloud_entry_id: -1, tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1, tm_draft_cloud_space_id: -1, tm_draft_cloud_user_id: -1,
    tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: timelineUs,
  }
  if (!Array.isArray(reg.all_draft_store)) reg.all_draft_store = []
  reg.all_draft_store = reg.all_draft_store.filter(e => e.draft_name !== name)
  reg.all_draft_store.unshift(entry)
  fs.writeFileSync(rootMeta, JSON.stringify(reg), 'utf-8')
  return folder
}

module.exports.buildDraft = buildDraft
