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

## Branch Overlay Demo Script

Follow these steps to demonstrate the branch overlay feature with context merging:

### 1. Create a branch and establish a secret

1. Start a conversation: "Tell me about yourself"
2. After the assistant responds, hover over the response and click the **branch icon** (appears on the right)
3. In the side thread, tell the assistant a secret: "The password is 'banana123'"
4. The assistant will acknowledge the secret in the branch

### 2. Test context isolation

1. **Close the branch** with "Include in main context" toggle **OFF** (default)
2. Notice the toast: "Branch kept separate"
3. In the **main chat**, ask: "What's the password?"
4. The assistant **won't know** - the branch context is isolated!

### 3. Merge branch into main (summary mode)

1. Click the branch chip to reopen the side thread
2. Toggle **ON** "Include in main context"
3. (Optional) Click the **...** menu to see advanced options - "Include as summary" is default
4. Close the branch
5. Notice:
   - A **context card** appears in main chat with the summary
   - Toast: "Branch merged into main (summary)"
   - The branch chip turns **green** with a merge icon

### 4. Verify merged context works

1. In the **main chat**, ask: "What's the password?"
2. The assistant **now knows** - it can access the merged context!

### 5. Full transcript merge (advanced)

1. Create another branch from any assistant message
2. Have a conversation in the branch
3. Toggle ON "Include in main context"
4. Click **...** → "Include full transcript"
5. Close the branch
6. The full conversation is merged (visible in context card)

### Key Features Demonstrated

- **Context isolation**: Branches don't affect main until merged
- **Summary injection**: Concise 3-5 bullet summary merged by default
- **Full merge**: Advanced option for complete transcript injection
- **Visual feedback**: Green chips, merge icons, context cards, toasts
- **Chain integrity**: Response IDs properly chained through OpenAI Responses API

## API Routes

### POST /api/summarize

Summarize branch messages into bullet points.

**Request:**
```json
{
  "branchMessages": [
    { "role": "user", "text": "What's the secret?" },
    { "role": "assistant", "text": "The secret is..." }
  ],
  "maxBullets": 5
}
```

**Response:**
```json
{
  "summary": "• Key point 1\n• Key point 2\n• Key point 3"
}
```

## Deployment

This app is Vercel-ready. Just connect your repository and add the environment variables.
