# Open Source Orchestrator

一个轻量级“开源项目串联”MVP。它把每个开源项目抽象成连接器，然后用工作流按顺序执行连接器，并把上一步输出传给下一步。

## 当前能力

- 网页控制台
- 连接器列表
- JSON 工作流编辑
- 工作流运行日志
- 模板变量注入，例如 `{{ fetch.output.text }}`
- 示例连接器：
  - `web.fetch`
  - `text.summarize`
  - `text.keywords`
  - `file.markdown`

## 本地运行

```bash
node server.js
```

如果系统没有全局 Node，可以使用 Codex 内置运行时：

```bash
/Users/jerm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

打开：

```text
http://localhost:3000
```

## 工作流格式

```json
{
  "name": "网页内容分析 Demo",
  "steps": [
    {
      "id": "fetch",
      "connector": "web.fetch",
      "input": {
        "url": "https://example.com"
      }
    },
    {
      "id": "summary",
      "connector": "text.summarize",
      "input": {
        "text": "{{ fetch.output.text }}",
        "sentences": 2
      }
    }
  ]
}
```

## 如何串联一个真实开源项目

不要直接把多个项目源码混在一起。推荐做法：

1. 给每个开源项目创建一个独立运行环境。
2. 用 Docker、HTTP API 或命令行封装执行入口。
3. 在 `src/orchestrator.js` 里登记连接器的输入和输出。
4. 在 `runConnector` 里添加执行逻辑。

连接器的目标格式：

```json
{
  "id": "ocr.tesseract",
  "name": "Tesseract OCR",
  "inputSchema": {
    "image": "file"
  },
  "outputSchema": {
    "text": "string"
  }
}
```

## 部署

项目包含 `api/` 和 `public/`，可部署到 Vercel。部署后：

- `/` 访问网页控制台
- `/api/connectors` 获取连接器
- `/api/run` 运行工作流

后续生产版建议加入：

- 用户系统
- 数据库
- Redis 队列
- Docker worker
- 文件存储
- 权限和配额控制
- 可视化画布
