// Nicknames for players who would rather not type one. The first word has at most 8 letters and the second
// at most 8, so every name fits the server's limit of 20 characters.
const first='Sneaky Wobbly Grumpy Sleepy Dizzy Fancy Soggy Spicy Cheesy Crispy Turbo Giggly Bouncy Clumsy Salty Funky Fluffy Cosmic Jolly Sassy Chaotic Wiggly Sweaty Crunchy Mighty Zesty Goofy Moody Snazzy Rowdy Hungry Cheeky Squishy Nervous Dramatic Royal Feral Confused Toasty Electric'.split(' ');
const second='Pickle Waffle Potato Llama Penguin Noodle Goose Burrito Hamster Pancake Walrus Cactus Nugget Otter Falafel Muffin Panda Avocado Pigeon Taco Raccoon Turnip Biscuit Platypus Mango Lobster Sloth Pretzel Donkey Meatball Badger Dumpling Yeti Crouton Goblin Alpaca Coconut Toaster Wombat Kebab'.split(' ');
const pick=(words:string[])=>words[Math.floor(Math.random()*words.length)];
export function funnyName(not=''):string {
 for(;;){const name=pick(first)+' '+pick(second);if(name!==not)return name}
}
