// The house rules for each rank, shared by the server and the screens.
export const kingsRules: Record<string, { title: string; rule: string }> = {
  A: { title: 'Waterfall', rule: 'Everyone drinks. Nobody stops before the player on their right does.' },
  '2': { title: 'You', rule: 'Pick someone to drink.' },
  '3': { title: 'Me', rule: 'You drink.' },
  '4': { title: 'Floor', rule: 'Touch the floor, then hit your phone. Last one drinks.' },
  '5': { title: 'Guys', rule: 'All the guys drink.' },
  '6': { title: 'Girls', rule: 'All the girls drink.' },
  '7': { title: 'Heaven', rule: 'Point at the sky, then hit your phone. Last one drinks.' },
  '8': { title: 'Mate', rule: 'Choose a drinking mate. When one of you drinks, so does the other.' },
  '9': { title: 'Rhyme', rule: 'Say a word and go around rhyming it. First to fail drinks.' },
  T: { title: 'Category', rule: 'Name a category and go around the table. First to fail drinks.' },
  J: { title: 'Never have I ever', rule: 'Say something you have never done. Anyone who has, drinks.' },
  Q: {
    title: 'Question master',
    rule: 'Until the next queen, anyone who answers your questions drinks.',
  },
  K: { title: 'King’s cup', rule: 'Pour into the cup and make a house rule. The fourth king drinks it all.' },
};
export const cupSips = 4;
