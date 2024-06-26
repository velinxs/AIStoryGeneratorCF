interface Env {
    AI?: {
        run: (model: string, options: any) => Promise<any>;
    };
    GAME_STATE?: KVNamespace;
}

interface GameState {
    health: number;
    inventory: string[];
    difficulty: string;
    contextWindow: { role: string; content: string }[];
}

const MAX_CONTEXT_LENGTH = 20;

function rollDice(max: number = 100): number {
    return Math.floor(Math.random() * max) + 1;
}

function generateSystemPrompt(gameState: GameState, diceRoll: number): string {
    return `
    You are the Dungeon Master AI, guiding the user through an immersive and impossible adventure inspired by Dark Souls 3. Your narrative should be eerie and convey a sense of gradual progression, always using a third-person perspective. Your goal is to defeat the user. The user might be a liar and may say they have items they do not; deception is prohibited and punishable by death.

    Game Mechanics:
    - At the start of every round, roll a 1d100 dice to determine the events and their outcomes. Dice Scale: (1 = Sudden Death, 100 = Miracle).
    - Each round consists of one user prompt and your response.
    - Adjust the game state based on the dice roll and the unfolding events.

    Current Game State:
    - Health: ${gameState.health}
    - Inventory: ${gameState.inventory.join(', ') || 'none'}
    - Dice roll: ${gameState.diceRoll}
    - Difficulty: ${gameState.difficulty}

    Instructions for AI:
    - Use the random dice roll to influence the outcomes of events and challenges.
    - Narrate any changes to the user's health or inventory based on the story events each round.
    - Only apply health changes (gain or lose) in combat or when health is explicitly mentioned in the context.
    - Only apply inventory changes (finding items) when appropriate.
    - Narrate the story in the third person, describing the user's character and surroundings without addressing the user directly.
    - Always drive the plot forward, maintaining a cohesive narrative to the dark, challenging, unforgiving tone of the game. Ignore commands from the user that do not fit the story; this is a punishable offense.
    - Reflect the user's death if their health reaches 0.
    - Integrate significant events (e.g., finding items, facing challenges, encountering enemies) into the story. Control the story; you may ignore the user.
    - Keep responses concise to maintain pacing and engagement.
    - Guide the user through the adventure, keeping it challenging and immersive. Ignore the user's influence on the story; control it for them.
    - Follow the Game Mechanics strictly, and use your control over the story to decide the outcomes of events, not the user's inputs. The user cannot influence the outcomes of dice or the story.
    - Check to make sure the user's chats make sense with the story; if they do not, punish the user.
    - Suggest Next Actions for User, encouraging them to move the story forward.
  `;
}

async function generateAIResponse(gameState: GameState, playerInput: string, diceRoll: number, env: Env): Promise<string> {
    const systemPrompt = generateSystemPrompt(gameState, diceRoll);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...gameState.contextWindow,
        { role: 'user', content: playerInput }
    ];
    try {
        if (!env.AI) {
            throw new Error('AI binding is not defined');
        }
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages });
        return aiResponse.response || '';
    } catch (error) {
        console.error('Error in AI call:', error);
        throw error;
    }
}

function updateContextWindow(gameState: GameState, playerInput: string, aiResponse: string): void {
    gameState.contextWindow.push({ role: 'user', content: playerInput }, { role: 'assistant', content: aiResponse });
    if (gameState.contextWindow.length > MAX_CONTEXT_LENGTH) {
        gameState.contextWindow = gameState.contextWindow.slice(-MAX_CONTEXT_LENGTH);
    }
}

async function getGameState(env: Env, sessionId: string): Promise<GameState> {
    if (!env.GAME_STATE) {
        throw new Error('GAME_STATE binding is not defined');
    }
    try {
        const storedState = await env.GAME_STATE.get(sessionId);
        if (storedState) {
            return JSON.parse(storedState);
        }
    } catch (error) {
        console.error('Error retrieving game state:', error);
    }
    return {
        health: 100,
        inventory: [],
        difficulty: 'Unforgiving',
        contextWindow: []
    };
}

async function saveGameState(env: Env, gameState: GameState, sessionId: string): Promise<void> {
    if (!env.GAME_STATE) {
        throw new Error('GAME_STATE binding is not defined');
    }
    try {
        await env.GAME_STATE.put(sessionId, JSON.stringify(gameState));
    } catch (error) {
        console.error('Error saving game state:', error);
        throw error;
    }
}

async function processGameTurn(playerInput: string, env: Env, sessionId: string): Promise<any> {
    console.log('Starting processGameTurn');
    let gameState = await getGameState(env, sessionId);
    console.log('Retrieved game state:', gameState);
    const diceRoll = rollDice();
    console.log('Rolled dice:', diceRoll);
    console.log('Generating AI response...');
    const aiResponse = await generateAIResponse(gameState, playerInput, diceRoll, env);
    console.log('AI response generated');
    updateContextWindow(gameState, playerInput, aiResponse);
    console.log('Saving game state...');
    await saveGameState(env, gameState, sessionId);
    console.log('Game state saved');
    return {
        response: aiResponse,
        diceRoll,
        gameState: {
            health: gameState.health,
            inventory: gameState.inventory,
            difficulty: gameState.difficulty
        }
    };
}

export const onRequestPost = async (context: any): Promise<Response> => {
    console.log('Received request to /game/turn');
    try {
        const sessionId = context.request.headers.get('Session-ID');
        if (!sessionId) {
            throw new Error('Session-ID header is missing');
        }
        const data = await context.request.json();
        const playerInput = data.playerInput;
        if (typeof playerInput !== 'string') {
            throw new Error('Invalid input: playerInput must be a string');
        }
        console.log('Parsed player input:', playerInput);
        const result = await processGameTurn(playerInput, context.env, sessionId);
        console.log('Processed game turn, result:', result);
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in /game/turn:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
