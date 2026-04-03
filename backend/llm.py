"""LLM streaming helpers — one async generator per provider."""

import json


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── Validation ────────────────────────────────────────────────────────────────

async def validate(provider: str, config: dict) -> dict:
    """Make a minimal 1-token call to verify credentials. Returns {valid, error?}."""
    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=config.get("apiKey"))
            await client.chat.completions.create(
                model=config.get("model", "gpt-4o"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
            )

        elif provider == "claude":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=config.get("apiKey"))
            await client.messages.create(
                model=config.get("model", "claude-sonnet-4-6"),
                max_tokens=1,
                messages=[{"role": "user", "content": "Hi"}],
            )

        elif provider == "gemini":
            from google import genai
            client = genai.Client(api_key=config.get("apiKey"))
            gemini_model = (config.get("model") or "gemini-2.0-flash").strip()
            await client.aio.models.generate_content(
                model=gemini_model,
                contents="Hi",
            )

        elif provider == "azure":
            from openai import AsyncAzureOpenAI
            client = AsyncAzureOpenAI(
                api_key=config.get("apiKey"),
                azure_endpoint=config.get("endpoint"),
                api_version=config.get("apiVersion", "2024-02-01"),
            )
            await client.chat.completions.create(
                model=config.get("deploymentName"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
            )

        elif provider == "ollama":
            import httpx
            base_url = config.get("baseUrl", "http://localhost:11434")
            model_name = config.get("modelName", "")
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{base_url}/api/tags")
                if r.status_code != 200:
                    return {"valid": False, "error": "Ollama nicht erreichbar."}
                available = [m["name"] for m in r.json().get("models", [])]
                if model_name and not any(model_name in m for m in available):
                    return {"valid": False, "error": f"Modell '{model_name}' nicht gefunden."}
        else:
            return {"valid": False, "error": f"Unbekannter Provider: {provider}"}

        return {"valid": True}

    except Exception as exc:
        msg = str(exc)
        low = msg.lower()
        if any(k in low for k in ("authentication", "api key", "unauthorized", "invalid_api_key", "auth")):
            return {"valid": False, "error": "Ungültiger API Key."}
        return {"valid": False, "error": msg[:300]}


# ── Non-streaming completion (used by agent planner) ──────────────────────────

async def complete(provider: str, config: dict, messages: list[dict]) -> str:
    """Collect full streamed response into a single string."""
    tokens: list[str] = []
    async for raw in stream_chat(provider, config, messages):
        if raw.startswith("data: "):
            try:
                data = json.loads(raw[6:])
                if data.get("type") == "token":
                    tokens.append(data["token"])
            except json.JSONDecodeError:
                pass
    return "".join(tokens)


# ── Streaming ─────────────────────────────────────────────────────────────────

async def stream_chat(provider: str, config: dict, messages: list[dict]):
    """
    Async generator yielding SSE strings.
    Event types: {"type": "token", "token": str}
                 {"type": "error", "error": str}
    """
    try:
        if provider == "openai":
            async for s in _openai_stream(config, messages):
                yield s
        elif provider == "azure":
            async for s in _azure_stream(config, messages):
                yield s
        elif provider == "claude":
            async for s in _claude_stream(config, messages):
                yield s
        elif provider == "gemini":
            async for s in _gemini_stream(config, messages):
                yield s
        elif provider == "ollama":
            async for s in _ollama_stream(config, messages):
                yield s
        else:
            yield _sse({"type": "error", "error": f"Unbekannter Provider: {provider}"})
    except Exception as exc:
        yield _sse({"type": "error", "error": str(exc)})


async def _openai_stream(config: dict, messages: list[dict]):
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=config.get("apiKey"))
    stream = await client.chat.completions.create(
        model=config.get("model", "gpt-4o"),
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        token = chunk.choices[0].delta.content
        if token:
            yield _sse({"type": "token", "token": token})


async def _azure_stream(config: dict, messages: list[dict]):
    from openai import AsyncAzureOpenAI
    client = AsyncAzureOpenAI(
        api_key=config.get("apiKey"),
        azure_endpoint=config.get("endpoint"),
        api_version=config.get("apiVersion", "2024-02-01"),
    )
    stream = await client.chat.completions.create(
        model=config.get("deploymentName"),
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        token = chunk.choices[0].delta.content
        if token:
            yield _sse({"type": "token", "token": token})


async def _claude_stream(config: dict, messages: list[dict]):
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=config.get("apiKey"))

    # Anthropic uses system as a top-level param, not inside messages
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    chat_msgs = [m for m in messages if m["role"] != "system"]

    kwargs = dict(
        model=config.get("model", "claude-sonnet-4-6"),
        max_tokens=4096,
        messages=chat_msgs,
    )
    if system_msg:
        kwargs["system"] = system_msg

    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield _sse({"type": "token", "token": text})


async def _gemini_stream(config: dict, messages: list[dict]):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.get("apiKey"))

    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    chat_msgs = [m for m in messages if m["role"] != "system"]

    # Convert to Gemini Content objects
    contents = [
        types.Content(
            role="user" if m["role"] == "user" else "model",
            parts=[types.Part(text=m["content"])],
        )
        for m in chat_msgs
    ]

    cfg = types.GenerateContentConfig(
        system_instruction=system_msg,
    )

    gemini_model = (config.get("model") or "gemini-2.0-flash").strip()
    async for chunk in await client.aio.models.generate_content_stream(
        model=gemini_model,
        contents=contents,
        config=cfg,
    ):
        if chunk.text:
            yield _sse({"type": "token", "token": chunk.text})


async def _ollama_stream(config: dict, messages: list[dict]):
    import httpx

    base_url = config.get("baseUrl", "http://localhost:11434")
    model_name = config.get("modelName", "")

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{base_url}/api/chat",
            json={"model": model_name, "messages": messages, "stream": True},
        ) as response:
            async for line in response.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("message", {}).get("content", "")
                if token:
                    yield _sse({"type": "token", "token": token})
