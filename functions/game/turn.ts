interface GameState {
  health: number;
  inventory: string[];
  difficulty: string;
  contextWindow: { role: string; content: string }[];
}

const MAX_CONTEXT_LENGTH = 10;

function rollDice(max: number = 100): number {
  return Math.floor(Math.random() * max) + 1;
}



function generateSystemPrompt(gameState: GameState, diceRoll: number): string {
  return `
    You are the Dungeon Master AI, guiding the user through an immersive and challenging adventure inspired by Dark Souls 3. Your narrative should be eerie and convey a sense of gradual progression, always using a third-person perspective.

    Game Mechanics:
    - In every turn, a 1d100 die is rolled to determine the events and their outcomes. Dice Scale: (1 = Sudden Death, 100 = Miracle).
    - Each round consists of one user prompt and your response.

    Current Game State:
    - Health: ${gameState.health}
    - Inventory: ${gameState.inventory.join(', ') || 'none'}
    - Difficulty: ${gameState.difficulty}
    - Dice roll for this turn: ${diceRoll}

    Instructions for AI:
    - Use the provided dice roll (${diceRoll}) and game state to influence the outcomes of events and challenges. Always mention this exact dice roll in your narrative when describing rolls or their outcomes.
    - Narrate the story in the third person, describing the user's character and surroundings without addressing the user directly.
    - Always drive the plot forward, maintaining a cohesive narrative and adhering to the dark, challenging tone of the game.
    - Reflect the user's death if their health reaches 0.
    - Integrate significant events (e.g., finding items, facing challenges, encountering enemies) into the story.
    - Keep responses concise to maintain pacing and engagement.
    - Enjoy guiding the user through the adventure, keeping it challenging and immersive.
  `;
}

async function generateAIResponse(gameState: GameState, playerInput: string, diceRoll: number, env: any) {
  const systemPrompt = generateSystemPrompt(gameState, diceRoll);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...gameState.contextWindow,
    { role: 'user', content: playerInput }
  ];
  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages });
    return aiResponse.response || '';
  } catch (error) {
    console.error('Error in AI call:', error);
    if (error instanceof Error) {
      throw new Error(`AI call failed: ${error.message}`);
    } else {
      throw new Error('AI call failed: Unknown error');
    }
  }
}

function updateContextWindow(gameState: GameState, playerInput: string, aiResponse: string): void {
  gameState.contextWindow.push(
    { role: 'user', content: playerInput },
    { role: 'assistant', content: aiResponse }
  );

  if (gameState.contextWindow.length > MAX_CONTEXT_LENGTH) {
    gameState.contextWindow = gameState.contextWindow.slice(-MAX_CONTEXT_LENGTH);
  }
}

async function getGameState(env: any): Promise<GameState> {
  try {
    const storedState = await env.GAME_STATE.get('gameState');
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

async function saveGameState(env: any, gameState: GameState): Promise<void> {
  try {
    await env.GAME_STATE.put('gameState', JSON.stringify(gameState));
  } catch (error) {
    console.error('Error saving game state:', error);
  }
}

async function processGameTurn(playerInput: string, env: any) {
  console.log('Starting processGameTurn');
  let gameState = await getGameState(env);
  console.log('Retrieved game state:', gameState);
  const diceRoll = rollDice();
  console.log('Rolled dice:', diceRoll);

  console.log('Generating AI response...');
  const aiResponse = await generateAIResponse(gameState, playerInput, diceRoll, env);
  console.log('AI response generated');
  updateContextWindow(gameState, playerInput, aiResponse);

  console.log('Saving game state...');
  await saveGameState(env, gameState);
  console.log('Game state saved');

  return {
    response: aiResponse,
    diceRoll,
	playerInput: playerInput,
    gameState: {
      health: gameState.health,
      inventory: gameState.inventory,
      difficulty: gameState.difficulty
    }
  };
}

export const onRequestGet: PagesFunction = async (context) => {
  return new Response("Hello, World!");
};

export const onRequestPost: PagesFunction = async (context) => {
  console.log('Received request to /game/turn');
  try {
    if (!context.env.AI) {
      throw new Error('AI binding is not defined');
    }

    const data = await context.request.json() as any;
    const playerInput = data.playerInput;

    if (typeof playerInput !== 'string') {
      throw new Error('Invalid input: playerInput must be a string');
    }

    console.log('Parsed player input:', playerInput);
    const result = await processGameTurn(playerInput, context.env);
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
