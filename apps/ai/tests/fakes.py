"""테스트용 가짜 LLM. 호출 이름(name)마다 준비한 답을 차례로 돌려줍니다."""

from dataclasses import dataclass, field

from app.clients.llm import JsonObject, LlmError


@dataclass
class Call:
    model: str
    system: str
    user: str
    schema: JsonObject
    name: str


@dataclass
class FakeLlm:
    # 이름별 답 목록. LlmError를 넣으면 그 차례에 예외를 던짐
    answers: dict[str, list[JsonObject | LlmError]] = field(default_factory=dict)
    calls: list[Call] = field(default_factory=list)

    def call(
        self,
        model: str,
        system: str,
        user: str,
        schema: JsonObject,
        name: str,
        *,
        max_tokens: int = 1500,
        temperature: float = 0.0,
    ) -> JsonObject:
        self.calls.append(Call(model, system, user, schema, name))
        queue = self.answers.get(name)
        if not queue:
            raise AssertionError(f"준비하지 않은 LLM 호출: {name}")
        a = queue.pop(0)
        if isinstance(a, LlmError):
            raise a
        return a

    def named(self, name: str) -> list[Call]:
        return [c for c in self.calls if c.name == name]
