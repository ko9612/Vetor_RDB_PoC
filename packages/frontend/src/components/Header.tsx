// Header — 타이틀 + 연결 상태 배지
// 근거: docs/화면_설계서.md §3.1

interface Props {
  connected: boolean | null; // null = 확인 중
}

export function Header({ connected }: Props) {
  return (
    <header className="mb-6 flex items-center justify-between border-b border-slate-200 py-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">유사 수주 검색 PoC</h1>
        <span className="text-sm text-slate-500">벡터 DB &#x27F7; RDB 비교</span>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] font-medium ${
          connected
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
        />
        {connected === null ? "확인 중..." : connected ? "연결됨" : "연결 오류"}
      </span>
    </header>
  );
}
