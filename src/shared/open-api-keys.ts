export interface OpenApiKeyStatus {
  status: 'unset' | 'configured' | 'legacy'
}

export interface GeneratedOpenApiKey extends OpenApiKeyStatus {
  key: string
}
