export function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return 'draw';
  
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'scissors' && choice2 === 'paper') ||
    (choice1 === 'paper' && choice2 === 'rock')
  ) {
    return 'player1';
  }
  
  return 'player2';
}

export function isValidChoice(choice) {
  return ['rock', 'paper', 'scissors'].includes(choice);
}
