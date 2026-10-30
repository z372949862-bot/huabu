# PiAPI Seedance 2.5 Less Restriction

核对日期：2026-10-30。来源：
- https://piapi.ai/docs/seedance-api/seedance-25
- https://piapi.ai/docs/seedance-api/get-task
- https://piapi.ai/docs/tools/file-upload
- https://piapi.ai/docs/account-info-api
- https://piapi.ai/docs/seedance-api/private-asset

## 使用
1. 设置 → 视频中转站 → PiAPI · Seedance 2.5，填写自己的 PiAPI API Key。
2. Base URL 为 https://api.piapi.ai；测试连接使用 GET /account/info，不提交视频。
3. 在视频节点中选择此中转站和 Seedance 2.5 Less Restriction。
4. 支持文生视频、全能参考、视频编辑、视频延长；提示词中的素材引用按实际上传顺序映射 @图片N / @视频N / @音频N。

## 已实现范围与限制
- POST /api/v1/task，model=seedance，task_type=seedance-2.5-less-restriction；认证 X-API-Key。
- 无参考素材时发送 mode=text_to_video，省略 omni_reference_task_type；有图片、视频或音频参考时发送 mode=omni_reference，并按操作发送 reference/edit/extend。纯文字模式携带参考任务类型会被平台以 HTTP 400 拒绝。
- 分辨率 480p/720p/1080p，默认720p；时长4–30整数秒，接口默认5秒。
- 比例16:9、9:16、4:3、3:4、21:9、1:1、自适应。普通参考生成时参考图比例优先。
- 提示词最多4000字符；最多30图/10视频/10音频、合计50项，允许纯音频参考。
- 视频MP4/MOV，每段2–30秒、≤200MB，总时长≤30秒；音频MP3/WAV，每段2–30秒、≤15MB，总时长≤30秒。
- 编辑：至少一段源视频，源视频4–30秒，adaptive，duration=-1，auto_upload_assets=false。
- 延长：至少一段视频，adaptive，duration为成片总时长4–30秒；提示词需明确延长意图。
- 本地素材使用官方 https://upload.theapi.app/api/ephemeral_resource；要求Creator或更高套餐，链接24小时后失效。按文档file_data字段10MB上限校验Base64长度，原文件约7.5MB。MOV及更大文件须用公网直链。
- 视频/音频提交前检查可播放时长和总时长。公网直链通过Range请求检查服务端提供的文件大小、格式；缺少大小信息时由上游最终校验。不推断未说明的图片宽高比限制，不自动裁切图片。
- GET /api/v1/task/{task_id}轮询同一任务，data.output.video下载到本地，校验MP4完整性。失败保留平台原因。查询或下载错误不会重新创建付费任务。提交响应丢失时提示先到平台核实。
- API Key不发送到成片CDN；手动逐跳处理下载重定向。

## 私有资产（Seedance 2.5）
在视频节点参数卡展开「私有资产」，勾选需要入库的人物、角色或产品参考；也可点击「选择已入库」读取当前账户的资产列表并选用。保留原始素材 URL 用于预览，生成请求按原顺序替换为 asset://asset-...，因此提示词素材编号不变。场景等未勾选素材仍走普通直链；auto_upload_assets=false。资产接口权限与临时文件上传权限分别由平台控制。

- 本地文件先通过官方临时上传服务获得 URL，再 POST /api/v1/asset/upload，使用 url、asset_type、name 和 X-API-Key。资产接口本身不接收本地路径或 Base64；用户直链应至少保持24小时可访问。
- 保存HTTP202返回的资产ID，GET /api/v1/asset/{id} 等到 Active 才创建视频任务。Failed 显示上游原因，超时保留ID供下次继续。
- 私有资产需要 hobbyist 或更高权限。图片<30MB、宽高均在(300,6000)px、比例(0.4,2.5)；视频≤50MB、2–15秒、480/720/1080p、24–60fps；音频≤15MB、2–15秒。前端检查可读取的尺寸/大小/时长，帧率及上游审核由平台最终校验；这些限制不套用到未入库的普通参考。已就绪资产的原始直链可能失效，不再要求重新下载验证，合计时长等约束仍由上游最终校验。
- 资产ID按中转站保存；桌面缓存按API Key摘要和素材来源隔离，不存明文密钥。重复使用先查询；明确404且保留原始素材时重新入库。提交入库响应不明时禁止自动重复POST，提示到资产库选择已入库条目。
- 视频编辑源视频保留原始可读直链，不替换为asset://。
- 视频任务ID及生成元数据单独持久化，重启后点击「继续查询上次任务」只查询原任务，不重传素材或重新创建视频。

## 本次未提供的高级流程
文档中的480p草稿 → draft_task_id转1080p成片属于两次独立付费请求，本次未添加草稿/转正式稿入口，也不会自动发起第二次生成。未提供私有资产删除、批量入库和平台账户订阅管理。

## 验证
提供者、桌面IPC、素材引用排序、目录迁移、断线恢复及原有应用回归均使用离线模拟测试。未使用真实PiAPI密钥，未产生付费生成请求。正式使用还取决于账户权限、额度、素材可访问性和上游服务状态。
