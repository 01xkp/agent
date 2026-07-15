# Python、FastAPI 与 LangGraph 小白指南

## 1. 为什么项目里同时有 Node 和 Python

现有 Vue、Electron、Node API 和腾讯云部署已经稳定，所以 Python 服务只负责教学：

```text
Node 主服务：项目真正的页面和线上 API
Python 服务：学习类型、异步、Pydantic、FastAPI、Tool Calling、LangGraph
```

两个服务互不替换。Python 未启动时，Node 主项目仍能正常运行。

## 2. 安装

项目根目录执行：

```bash
python --version
python -m pip install -r services/fastapi-teaching/requirements.txt
```

本项目已验证 Python 3.10。

固定依赖：

```text
fastapi==0.116.1
langgraph==1.0.10
uvicorn==0.35.0
```

## 3. 检查和测试

```bash
npm run python:check
npm run python:test
```

- `python:check`：检查 Python 文件能否编译；
- `python:test`：验证健康接口、高风险工具确认和 LangGraph 状态图。

## 4. 启动 FastAPI

```bash
python -m uvicorn main:app \
  --app-dir services/fastapi-teaching \
  --host 127.0.0.1 \
  --port 8000
```

Windows PowerShell 建议使用一行：

```powershell
python -m uvicorn main:app --app-dir services/fastapi-teaching --host 127.0.0.1 --port 8000
```

打开：

- Swagger 页面：`http://127.0.0.1:8000/docs`
- 健康接口：`http://127.0.0.1:8000/health`

## 5. Tool Calling 示例

只读工单查询：

```json
{
  "message": "查询工单",
  "tool_calls": [
    {
      "name": "ticket.lookup",
      "arguments": {
        "ticket_id": "T-1001"
      }
    }
  ]
}
```

高风险退款预览：

```json
{
  "message": "准备退款",
  "tool_calls": [
    {
      "name": "refund.preview",
      "arguments": {
        "ticket_id": "T-1002",
        "amount": 99,
        "idempotency_key": "refund-demo-001"
      },
      "approved": false
    }
  ]
}
```

返回 `pending_confirmation` 表示程序没有执行副作用，正在等人确认。

## 6. Pydantic 在做什么

Pydantic 会在进入业务逻辑前检查请求：

```python
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    tool_calls: list[ToolCallRequest] = Field(default_factory=list)
```

例如空消息、过长消息和错误字段类型会直接返回验证错误，不会进入工具执行。

## 7. async / await 在做什么

FastAPI 路由使用：

```python
async def chat(request: ChatRequest) -> ChatResponse:
    ...
```

`async` 适合网络请求、数据库和模型调用等等待较多的工作。教学工具现在使用本地数据，所以执行很快，但接口形态已经可以替换为真正的异步业务调用。

## 8. LangGraph 示例

文件：

```text
services/fastapi-teaching/langgraph_demo.py
```

状态图：

```text
START
  → plan
  → retrieve
  → answer
  → END
```

运行：

```bash
python -c "import sys; sys.path.insert(0, 'services/fastapi-teaching'); from langgraph_demo import run_research_graph; print(run_research_graph('退款超过三天怎么办？'))"
```

示例使用 `InMemorySaver`。它证明状态和 Checkpoint 能工作，但进程重启后数据会丢失。生产环境应替换为数据库 Checkpointer。

## 9. 常见问题

### `ModuleNotFoundError`

先执行：

```bash
python -m pip install -r services/fastapi-teaching/requirements.txt
```

### 8000 端口被占用

换一个端口：

```bash
python -m uvicorn main:app --app-dir services/fastapi-teaching --port 8001
```

### 为什么没有把 FastAPI 部署到腾讯云

当前腾讯云 `csfan` 服务运行 Node 主项目。为了不引入第二套部署、路由和运维复杂度，FastAPI 暂时保持独立教学服务。生产接入前应先决定：

1. 合并到同一容器；
2. 单独部署为内部服务；
3. 由 Node 通过受控内网调用。
