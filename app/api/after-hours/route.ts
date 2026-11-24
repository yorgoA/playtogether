import { current, publicProfile, reply } from '@/lib/server/profiles';
export async function GET(req: Request) {
  if (!publicProfile(await current(req))?.adult)
    return reply({ error: 'An adult profile is required.' }, 403);
  return reply({
    games: [
      {
        name: 'Toast Topics',
        rule: 'Take turns naming something in the category. A repeat ends the round. The last player with a new answer gives a toast with any drink.',
        rounds: [
          'Things you pack for a road trip',
          'Films with a number in the title',
          'Songs everyone knows the chorus to',
          'Things found in a hotel room',
          'Cities by the sea',
        ],
      },
      {
        name: 'Cheers to That',
        rule: 'Read the prompt aloud. Everyone it applies to raises a glass. Pick one person to tell the story. Any drink works.',
        rounds: [
          'Cheers if you have missed the last train home.',
          'Cheers if you have met someone famous by accident.',
          'Cheers if you have sung karaoke in another language.',
          'Cheers if you have cooked for ten or more people.',
          'Cheers if you have booked a trip on the same day you left.',
        ],
      },
    ],
  });
}
