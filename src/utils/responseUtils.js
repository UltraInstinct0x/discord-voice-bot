function generateInitialResponse(prompt, username) {
  // Extract key topics from the prompt
  const topics = prompt.toLowerCase();
  
  if (topics.includes('image') || topics.includes('picture')) {
    return `I see ${username} has shared an image. Let me take a look at it.`;
  } else if (topics.includes('analyze') || topics.includes('review')) {
    return `I'll analyze that for ${username}. Give me a moment to think about it.`;
  } else if (topics.includes('help') || topics.includes('how')) {
    return `I'll help ${username} with that. Let me prepare a detailed response.`;
  } else if (topics.includes('explain') || topics.includes('what')) {
    return `I'll explain that for ${username}. Let me gather my thoughts.`;
  }
  
  return `I'm processing ${username}'s request, please wait briefly.`;
}

module.exports = {
  generateInitialResponse,
};
