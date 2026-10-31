/** Port for sending SMS (ADR-0010). Adapters: development outbox, Sinch (EU). */
export interface SmsSender {
  send(sms: { to: string; body: string }): Promise<{ providerMessageId: string }>;
}
