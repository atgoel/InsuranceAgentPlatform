/** M06 domain events (payloads carry ids, enums and paise totals — no names). */
export const ADVICE_EVENTS = {
  ADVICE_FINALISED: 'advice.record.finalised',
  QUOTE_OPTION_CREATED: 'quote.option.created',
  QUOTE_SHARED: 'quote.request.shared',
  QUOTE_OPTION_SELECTED: 'quote.option.selected',
  BI_ACKNOWLEDGED: 'advice.bi.acknowledged',
} as const;

export interface QuoteSharedEvent {
  quoteRequestId: string;
  opportunityId: string;
}

export interface QuoteOptionSelectedEvent {
  quoteRequestId: string;
  optionId: string;
  versionId: string;
  totalPaise: number;
}
