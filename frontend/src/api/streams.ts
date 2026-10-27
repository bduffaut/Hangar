/**
 * A server-sent event stream. The browser reconnects by itself after a drop and, for streams that
 * send event IDs (build logs), resumes after the last one it received.
 */
export interface Stream {
  close(): void
}

export function openStream(
  url: string,
  handlers: Record<string, (data: never) => void>,
  options: { onError?: () => void } = {},
): Stream {
  const source = new EventSource(url, { withCredentials: true })
  for (const [event, handler] of Object.entries(handlers)) {
    source.addEventListener(event, (message) => {
      handler(JSON.parse((message as MessageEvent<string>).data) as never)
    })
  }
  source.onerror = () => options.onError?.()
  return { close: () => source.close() }
}
