# Morning Call Control

Painel operacional para controlar tenants, numeros autorizados, configuracoes de Power BI e execucoes do Morning Call.

## Deploy na Vercel

1. Crie um novo projeto na Vercel apontando para este repositorio.
2. Em **Root Directory**, selecione `morning-call-control`.
3. Configure as variaveis de ambiente do Firebase:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Colecoes Firestore usadas

- `tenants`
- `morning_call_contacts`
- `powerbi_configs`
- `morning_call_executions`

## Uso pelo n8n

O flow principal do Morning Call deve consultar `morning_call_contacts` pelo telefone normalizado. O contato encontrado define o `tenant`, a frase de confirmacao e se o numero esta autorizado.
