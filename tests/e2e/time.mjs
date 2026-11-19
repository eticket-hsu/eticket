// 서버는 공연 시각을 '시간대 없는 현지 시각'(LocalDateTime)으로 받는다.
// 테스트와 서버가 같은 컴퓨터에서 돌므로, 이 컴퓨터의 현지 시각 문자열을 만든다.
// (toISOString 은 UTC 라서 시간대마다 결과가 달라지므로 쓰지 않는다)
export function localDateTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
