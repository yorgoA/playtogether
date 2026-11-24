// Where quiz questions come from: the Open Trivia Database, with our own bank when it cannot be reached.

export type Question = { theme: string; text: string; right: string; wrong: string[] };

const source = 'https://opentdb.com/api.php?amount=50&type=multiple&encode=url3986';
// The database refuses a second request from one address within five seconds.
const restMs = 5500;
const timeoutMs = 2500;
const keep = 400;

const themes: Record<string, string> = {
  'General Knowledge': 'General knowledge',
  'Entertainment: Books': 'Books',
  'Entertainment: Film': 'Movies',
  'Entertainment: Music': 'Music',
  'Entertainment: Musicals & Theatres': 'Music',
  'Entertainment: Television': 'TV shows',
  'Entertainment: Video Games': 'Games',
  'Entertainment: Board Games': 'Games',
  'Entertainment: Comics': 'Cartoons & comics',
  'Entertainment: Japanese Anime & Manga': 'Cartoons & comics',
  'Entertainment: Cartoon & Animations': 'Cartoons & comics',
  'Science & Nature': 'Science',
  'Science: Computers': 'Technology',
  'Science: Gadgets': 'Technology',
  'Science: Mathematics': 'Numbers',
  Mythology: 'Mythology',
  Sports: 'Sports',
  Geography: 'Geography',
  History: 'History',
  Politics: 'History',
  Art: 'Art',
  Celebrities: 'Celebrities',
  Animals: 'Animals',
  Vehicles: 'Vehicles',
};

const bank: Record<string, [string, string, string, string, string][]> = {
  Geography: [
    ['Which city is home to the Sagrada Família?', 'Barcelona', 'Madrid', 'Lisbon', 'Seville'],
    ['Which ocean lies between Africa and Australia?', 'Indian', 'Pacific', 'Atlantic', 'Arctic'],
    ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
    ['Which country has the most people living in Africa?', 'Nigeria', 'Egypt', 'Ethiopia', 'Kenya'],
  ],
  Science: [
    ['Which element has the chemical symbol Fe?', 'Iron', 'Fluorine', 'Francium', 'Gold'],
    ['Which moon is the largest in our solar system?', 'Ganymede', 'Europa', 'Titan', 'Io'],
    ['What does a seismograph record?', 'Ground motion', 'Wind speed', 'Rainfall', 'Moon phases'],
    ['Which planet has the Great Red Spot?', 'Jupiter', 'Saturn', 'Neptune', 'Uranus'],
  ],
  Animals: [
    ['How many hearts does an octopus have?', 'Three', 'One', 'Two', 'Four'],
    ['Which of these mammals lays eggs?', 'Platypus', 'Sloth', 'Otter', 'Koala'],
    ['Which word names a group of wolves?', 'Pack', 'School', 'Flock', 'Colony'],
    ['Which is the tallest living animal?', 'Giraffe', 'Elephant', 'Ostrich', 'Camel'],
  ],
  Music: [
    ['Which instrument has a reed?', 'Clarinet', 'Trombone', 'Violin', 'Flute'],
    ['How many strings does a standard violin have?', 'Four', 'Five', 'Six', 'Eight'],
    ['Which band recorded “Bohemian Rhapsody”?', 'Queen', 'The Who', 'Genesis', 'ABBA'],
    ['Which dance originated in Argentina and Uruguay?', 'Tango', 'Polka', 'Waltz', 'Flamenco'],
  ],
  Numbers: [
    ['How many sides does a dodecagon have?', '12', '8', '10', '20'],
    ['Which is the smallest prime number?', 'Two', 'Zero', 'One', 'Three'],
    ['What is 15% of 200?', '30', '15', '25', '45'],
    ['How many degrees do a triangle’s angles add up to?', '180', '90', '270', '360'],
  ],
  Food: [
    ['Which pasta is a small tube with diagonal ends?', 'Penne', 'Farfalle', 'Fusilli', 'Linguine'],
    ['What is the main ingredient of hummus?', 'Chickpeas', 'Lentils', 'Aubergine', 'Fava beans'],
    ['Which country does paella come from?', 'Spain', 'Portugal', 'Mexico', 'Italy'],
    ['Which spice is the most expensive by weight?', 'Saffron', 'Vanilla', 'Cardamom', 'Cinnamon'],
  ],
  Sports: [
    ['In which sport would you attempt a slam dunk?', 'Basketball', 'Volleyball', 'Tennis', 'Handball'],
    ['How many players does a football team have on the pitch?', 'Eleven', 'Nine', 'Ten', 'Twelve'],
    ['Which country won the first football World Cup?', 'Uruguay', 'Brazil', 'Italy', 'Argentina'],
    ['In which sport is the Stanley Cup awarded?', 'Ice hockey', 'Baseball', 'Golf', 'Rugby'],
  ],
  Books: [
    ['Who created Sherlock Holmes?', 'Arthur Conan Doyle', 'Agatha Christie', 'Jules Verne', 'Mary Shelley'],
    ['Who wrote “Romeo and Juliet”?', 'William Shakespeare', 'Jane Austen', 'Charles Dickens', 'Homer'],
    ['Which novel begins with a sailor named Ishmael?', 'Moby-Dick', 'Treasure Island', 'Emma', 'Ulysses'],
    ['Who wrote “1984”?', 'George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'H. G. Wells'],
  ],
  Art: [
    ['Which artist painted The Starry Night?', 'Van Gogh', 'Monet', 'Klimt', 'Dalí'],
    ['Which museum holds the Mona Lisa?', 'The Louvre', 'The Prado', 'The Uffizi', 'Tate Modern'],
    ['Which two colors make green?', 'Blue and yellow', 'Red and blue', 'Red and yellow', 'Blue and white'],
    ['Who sculpted David, finished in 1504?', 'Michelangelo', 'Donatello', 'Bernini', 'Rodin'],
  ],
  History: [
    ['Which country gave the Statue of Liberty to the United States?', 'France', 'Italy', 'Canada', 'Spain'],
    ['In which year did the Berlin Wall fall?', '1989', '1979', '1985', '1991'],
    ['Which ship sank on its first voyage in 1912?', 'Titanic', 'Lusitania', 'Britannic', 'Bismarck'],
    ['Which civilization built Machu Picchu?', 'Inca', 'Maya', 'Aztec', 'Olmec'],
  ],
  Movies: [
    ['Who directed “Jurassic Park”?', 'Steven Spielberg', 'James Cameron', 'George Lucas', 'Ridley Scott'],
    ['Which film features a clownfish looking for his son?', 'Finding Nemo', 'Moana', 'Luca', 'Shark Tale'],
    ['Which movie won the Oscar for Best Picture of 1997?', 'Titanic', 'Fargo', 'Braveheart', 'Gladiator'],
    ['What color is the pill Neo takes in “The Matrix”?', 'Red', 'Blue', 'Green', 'White'],
  ],
  Technology: [
    [
      'What does CPU stand for?',
      'Central processing unit',
      'Core power unit',
      'Computer program utility',
      'Control port unit',
    ],
    ['Which company makes the iPhone?', 'Apple', 'Samsung', 'Google', 'Sony'],
    ['How many bits are in a byte?', 'Eight', 'Four', 'Ten', 'Sixteen'],
    ['What does the W in WWW first stand for?', 'World', 'Web', 'Wide', 'Wireless'],
  ],
  Mythology: [
    ['Who is king of the gods in Greek myth?', 'Zeus', 'Poseidon', 'Hades', 'Apollo'],
    ['Which hammer does Thor carry?', 'Mjölnir', 'Gungnir', 'Excalibur', 'Aegis'],
    ['What grows back when you cut one off the Hydra?', 'Heads', 'Wings', 'Tails', 'Claws'],
    ['Which animal’s head does the Egyptian god Anubis have?', 'Jackal', 'Falcon', 'Cat', 'Crocodile'],
  ],
};
export const ownQuestions: Question[] = Object.entries(bank).flatMap(([theme, list]) =>
  list.map(([text, right, ...wrong]) => ({ theme, text, right, wrong })),
);

// What this Worker has fetched so far, so a busy evening does not ask again for every match.
let pool: Question[] = [];
let askedAt = 0;

export function parseTrivia(data: unknown): Question[] {
  const results = (data as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((raw) => {
    try {
      const plain = (value: unknown) => decodeURIComponent(String(value)).trim();
      const theme = themes[plain(raw.category)];
      const text = plain(raw.question);
      const right = plain(raw.correct_answer);
      const wrong = (raw.incorrect_answers as unknown[]).map(plain);
      const answers = [right, ...wrong];
      // Obscure, very long or malformed questions do not work on a TV.
      if (
        !theme ||
        raw.difficulty === 'hard' ||
        text.length > 170 ||
        answers.some((a) => !a || a.length > 60)
      )
        return [];
      return wrong.length === 3 && new Set(answers).size === 4 ? [{ theme, text, right, wrong }] : [];
    } catch {
      return [];
    }
  });
}

// Never fails: the caller always gets at least our own questions.
export async function findQuestions(now: number): Promise<Question[]> {
  if (now - askedAt >= restMs) {
    askedAt = now;
    try {
      const reply = await fetch(source, { signal: AbortSignal.timeout(timeoutMs) });
      const fresh = reply.ok ? parseTrivia(await reply.json()) : [];
      const known = new Set(fresh.map((q) => q.text));
      pool = [...fresh, ...pool.filter((q) => !known.has(q.text))].slice(0, keep);
    } catch {
      // Offline or too slow: play with what we have.
    }
  }
  // Ours fill in only when the pool cannot give a long match a new theme every round.
  return new Set(pool.map((q) => q.theme)).size >= 10 ? pool : [...pool, ...ownQuestions];
}
