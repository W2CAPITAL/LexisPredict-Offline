# SheetsPredict Security

SheetsPredict is open source, but deployment credentials and operational security details are private deployment data.

## Responsible disclosure

Do not publish working credentials, customer data, private deployment addresses, exploit steps, or sensitive incident details in public issues or documentation.

Use GitHub private vulnerability reporting / Security Advisories when available. If that channel is unavailable, contact the repository owner through a private channel.

## Deployment principles

- Keep service credentials and API keys on the server.
- Use a dedicated PredictLM API credential for the SheetsPredict integration.
- Keep browser sessions separate from service-to-service credentials.
- Do not commit production URLs that identify private bridges, sheets, or internal services.
- Treat remote responses and user-supplied content as untrusted until validated.
- Keep integrations optional so the core spreadsheet workflow can degrade safely when an external service is unavailable.

## Open-source AI configuration

A fork may use PredictLM or its own OpenAI-compatible AI service. Provider credentials belong in the server environment and must not be embedded in client-side JavaScript or committed configuration.

## Scope

Hosting IAM, encrypted secret storage, network policy, provider-side controls, database/Google Sheets permissions, backups, device security, and independent security review remain responsibilities of each deployment.
