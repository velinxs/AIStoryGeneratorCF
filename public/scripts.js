document.getElementById('submitBtn').addEventListener('click', handleUserInput);
document.getElementById('userInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleUserInput();
    }
});

async function handleUserInput() {
    const userInput = document.getElementById('userInput').value;
    if (!userInput.trim()) return;

    try {
        const response = await fetch('/api/game/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerInput: userInput })
        });

        if (response.ok) {
            const data = await response.json();
            updateGameState(data);
            appendToStory(userInput, data.response);
        } else {
            console.error('Error:', response.statusText);
            appendToStory(userInput, "An error occurred. Please try again.");
        }
    } catch (error) {
        console.error('Request failed:', error);
        appendToStory(userInput, "A network error occurred. Please check your connection and try again.");
    }

    document.getElementById('userInput').value = '';
}

function updateGameState(data) {
    document.getElementById('health').textContent = `Health: ${data.gameState.health}`;
    document.getElementById('inventory').textContent = `Inventory: ${data.gameState.inventory.join(', ') || 'None'}`;
    document.getElementById('difficulty').textContent = `Difficulty: ${data.gameState.difficulty}`;
    document.getElementById('lastRoll').textContent = `Last Roll: ${data.diceRoll}`;
}

function appendToStory(userInput, aiResponse) {
    const storyDiv = document.getElementById('story');
    storyDiv.innerHTML += `<p><strong>You:</strong> ${userInput}</p>`;
    storyDiv.innerHTML += `<p><strong>Dungeon Master:</strong> ${aiResponse}</p>`;
    storyDiv.scrollTop = storyDiv.scrollHeight;
}
