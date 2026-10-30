# 更新日志

## 0.3.23

- 新增 PiAPI Seedance 2.5 Less Restriction，支持文生视频、素材参考、视频编辑与延长
- 新增 PiAPI 私有资产入库、选择已入库素材、状态查询与任务恢复
- 新增 PiAPI Seedream 5 Pro Less Restriction 图片模型，支持 1K / 2K、10 种比例、最多 10 张参考图以及 JPEG / PNG 输出
- 图片和视频生成结果保存到本地，已获取任务 ID 的查询、下载重试不重复提交生成
- 修复 AIMI 失败原因识别，避免将错误文字当作视频地址
- Windows 安装包与免安装包采用稳定英文文件名，配套自动更新元数据；发布前执行自动测试

## 0.3.22

- 修复 AIMI sd2.5-n 提交时错误发送 `enable_audio` 导致 HTTP 400
- sd2.5-n 保留参考音频输入；音频生成开关仅用于文档确认支持的 JL Seedance 2.5 型号

## 0.3.21

- 接入 AIMI Seedance 2.5 JL 与 sd2.5-n 模型，提供 480p / 720p 选项
- 支持 AIMI 视频生成音频开关及参考图片、视频、音频

## 0.3.19

- 新增洛辞 API 图片中转站
- 接入 Seedream 5 Pro Uncensored（1K / 1.5K / 2K）
- 支持 8 种画面比例、报价、异步任务轮询与鉴权图片下载
- Seedream 5 Pro 支持参考图输入（Base64/data URL）
- Seedance 2.5 HC 默认开启 AIIDE 原生音频生成，可手动关闭
- 增加余额鉴权、积分不足、幂等冲突和任务失败提示

## 0.3.18

- AIIDE Dreamina Seedance 2.5 HC 新增 480p 和 720p 分辨率选项，默认使用 720p。
