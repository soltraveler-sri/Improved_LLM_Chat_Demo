# LLM Chat Demos

Product improvements to LLM chat interfaces, showcasing better UX patterns for AI conversations.

## Features

- **Branch Overlay Demo** - Explore conversation branches with visual tree navigation
- **History Demo** - (Coming soon) Semantic search across conversations
- **Codex Demo** - (Coming soon) Code generation with safe execution

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui (Radix-based components)
- OpenAI Responses API

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Copy the environment template and add your OpenAI API key:
```bash
cp .env.example .env.local
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | (required) |
| `OPENAI_MODEL` | Model to use | `gpt-4o` |
| `OPENAI_REASONING_FAST` | Reasoning effort for fast mode | `low` |
| `OPENAI_REASONING_DEEP` | Reasoning effort for deep mode | `medium` |
| `OPENAI_TEXT_VERBOSITY` | Text output verbosity | `low` |
| `OPENAI_MAX_OUTPUT_TOKENS` | Max tokens per response | `600` |

## API Routes

### POST /api/respond

Send a message and get a response from the OpenAI Responses API.

**Request:**
```json
{
  "input": "Hello, how are you?",
  "previous_response_id": null,
  "mode": "deep"
}
```

**Response:**
```json
{
  "id": "resp_...",
  "output_text": "I'm doing well, thanks for asking!"
}
```

## Deployment

This app is Vercel-ready. Just connect your repository and add the environment variables.
