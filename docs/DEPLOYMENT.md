# 云端部署与联调

此仓库默认运行本地演示。下列步骤由拥有小程序账号及云环境权限的开发者执行，当前工作未上传代码、创建云环境或发布小程序。

## 配置

1. 将 `project.config.json` 的 `appid` 改为自己的小程序 AppID。
2. 在开发者工具中创建 / 选择云开发环境，获取环境 ID。
3. 修改 `miniprogram/config.js` 为 `{ mode: 'cloud', cloudEnv: '你的环境ID' }`。
4. 执行 `npm.cmd run sync:cloud`，保持云端与本地领域规则一致。
5. 在云开发控制台创建集合 `profiles`、`trips`、`needs`、`reports`。
6. 每个集合分别配置自定义客户端权限为 `cloudfunctions/database.rules.json` 中的规则：客户端读写均关闭。所有业务操作通过云函数完成，不能为联调方便开启全部公开读写。
7. 右键 `cloudfunctions/carpool`，上传并部署（云端安装依赖）。云函数名称必须为 `carpool`。
8. 编译小程序，使用两个微信账号测试完整申请、确认、取消、交接与结算流程。

配置并部署完成后，可以在本项目的开发者工具自动化端口开启时执行 `npm.cmd run test:cloud`。该脚本拒绝演示模式，检查真实云函数 `health`、`profile`、`list`、`mine` 的返回，不创建或修改云数据。`health` 同时验证调用者身份和四个集合可读性；客户端禁读写权限还需另外验证。

云函数依赖 `wx-server-sdk ~3.0.1`。环境可使用支持 Node.js 18+ 的运行时。小程序端没有 npm 构建步骤。

## 数据索引

按云开发控制台查询提示创建对应组合索引，建议：

| 集合 | 索引字段 |
|---|---|
| trips / needs | status 升序、departAt 升序、createdAt 降序 |
| trips / needs | ownerId 升序、createdAt 降序 |
| trips | applications.parentId 升序、createdAt 降序 |

“我的行程”查询使用 ownerId 或 applications.parentId。若环境对多键索引与排序有限制，可将其拆成两次查询后去重；需要在目标云环境实际验证。

当前列表在服务端分批读取后返回全部匹配记录，适用于早期联调；规模扩大前改为游标分页，避免大列表达到云函数响应上限。

## 身份与权限

- 云函数从 `cloud.getWXContext().OPENID` 识别调用者，不接受前端指定用户身份。
- 修改业务状态全部使用数据库事务；确认申请同时更新行程和该学生家长的时间占用记录。
- 新档案默认 `verified: false`，普通用户不能通过保存档案改为已审核。
- 演示角色切换只存在于本地演示模式。云端始终使用真实 OPENID。
- 详细接送位置、电话、车辆按参与关系返回；公开列表没有学生资料。
- 举报仅进入 reports 集合；此版本没有自动处理、没有管理员通知或审核界面。

## 正式开放前待完成

- 同校家长、电话归属、驾驶人及车辆资料审核和后台访问授权。
- 小程序隐私声明、家庭信息授权、数据保留和删除机制。
- 经用户同意订阅的通知模板及发送配置；在通知失败时保留明确处理办法。
- 内容审核、操作限频、监控报警、备份和账单争议处理。
- 双账号并发抢最后座位、跨车重复确认、事务回滚、取消后重试等云端验证。
- 真机页面布局、低网速、返回页面后的状态刷新测试。

## 官方参考

- [微信官方云开发示例](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/page/cloud/README.md)
- [微信服务端 SDK 接口定义](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/index.d.ts)

文档链接为配置参考；部署是否成功以你选择的实际云环境联调结果为准。
