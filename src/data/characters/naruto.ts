import type { AnimeCharacterSet } from "./types";

export const narutoCharacters: AnimeCharacterSet = {
  animeId: "naruto",
  characters: [
    {
      slug: "naruto-uzumaki",
      name: "Naruto Uzumaki",
      title: "Jinchūriki of the Nine-Tails",
      description:
        "The Hidden Leaf's most unpredictable ninja. Shunned as a child for the fox sealed inside him, he never gave up on his dream of becoming Hokage and earning everyone's acknowledgement.",
      abilities: ["Shadow Clone Jutsu", "Rasengan", "Sage Mode", "Nine-Tails Chakra Mode"],
      rarity: "MYTHIC",
      powerLevel: 98,
    },
    {
      slug: "sasuke-uchiha",
      name: "Sasuke Uchiha",
      title: "Last Avenger of the Uchiha",
      description:
        "A prodigy who survived the massacre of his clan and walked a path of vengeance. His Sharingan and later Rinnegan make him one of the strongest shinobi of his era.",
      abilities: ["Chidori", "Amaterasu", "Susanoo", "Rinnegan"],
      rarity: "MYTHIC",
      powerLevel: 97,
    },
    {
      slug: "madara-uchiha",
      name: "Madara Uchiha",
      title: "Ghost of the Uchiha",
      description:
        "Co-founder of the Hidden Leaf and legendary leader of the Uchiha clan. Disillusioned with the shinobi world, he plotted the Infinite Tsukuyomi to bring about his vision of peace.",
      abilities: ["Perfect Susanoo", "Rinnegan", "Wood Release", "Meteor Drop"],
      rarity: "MYTHIC",
      powerLevel: 99,
    },
    {
      slug: "hashirama-senju",
      name: "Hashirama Senju",
      title: "God of Shinobi",
      description:
        "The First Hokage and founder of the Hidden Leaf. His unique Wood Release and immense chakra let him subdue the tailed beasts and stand as Madara's equal.",
      abilities: ["Wood Release", "Sage Mode", "Wood Golem", "Instant Regeneration"],
      rarity: "MYTHIC",
      powerLevel: 98,
    },
    {
      slug: "itachi-uchiha",
      name: "Itachi Uchiha",
      title: "Prodigy of the Uchiha",
      description:
        "A genius who joined the Akatsuki after carrying out a secret mission against his own clan. He bore the hatred of his younger brother Sasuke to protect the village from the shadows.",
      abilities: ["Tsukuyomi", "Amaterasu", "Susanoo", "Master Genjutsu"],
      rarity: "LEGENDARY",
      powerLevel: 93,
    },
    {
      slug: "kakashi-hatake",
      name: "Kakashi Hatake",
      title: "The Copy Ninja",
      description:
        "Leader of Team 7 and a veteran of countless missions. Using the Sharingan gifted by his late friend Obito, he is said to have copied over a thousand jutsu.",
      abilities: ["Lightning Blade", "Sharingan Copy", "Kamui", "Summoning: Ninja Hounds"],
      rarity: "LEGENDARY",
      powerLevel: 88,
    },
    {
      slug: "minato-namikaze",
      name: "Minato Namikaze",
      title: "The Yellow Flash",
      description:
        "The Fourth Hokage and Naruto's father. Feared on the battlefield for his speed, he gave his life sealing the Nine-Tails inside his newborn son.",
      abilities: ["Flying Thunder God", "Rasengan", "Reaper Death Seal", "Sage Mode"],
      rarity: "LEGENDARY",
      powerLevel: 91,
    },
    {
      slug: "jiraiya",
      name: "Jiraiya",
      title: "The Toad Sage",
      description:
        "One of the Legendary Sannin, a spymaster and author. He mentored both Minato and Naruto and passed down the Rasengan and Sage Mode.",
      abilities: ["Sage Mode", "Toad Summoning", "Rasengan", "Needle Jizo"],
      rarity: "LEGENDARY",
      powerLevel: 87,
    },
    {
      slug: "nagato",
      anilistId: 3180,
      name: "Nagato",
      title: "Pain of the Akatsuki",
      description:
        "A war orphan from the Hidden Rain who awakened the Rinnegan. Leading the Akatsuki through the Six Paths of Pain, he believed shared suffering would bring peace.",
      abilities: ["Six Paths of Pain", "Almighty Push", "Planetary Devastation", "Outer Path"],
      rarity: "LEGENDARY",
      powerLevel: 92,
    },
    {
      slug: "obito-uchiha",
      anilistId: 3149,
      name: "Obito Uchiha",
      title: "The Masked Man",
      description:
        "Once Kakashi's cheerful teammate, he was manipulated by Madara after witnessing Rin's death and orchestrated the Fourth Great Ninja War as the Ten-Tails' jinchūriki.",
      abilities: ["Kamui", "Sharingan", "Wood Release", "Ten-Tails Jinchūriki"],
      rarity: "LEGENDARY",
      powerLevel: 94,
    },
    {
      slug: "tsunade",
      name: "Tsunade",
      title: "The Fifth Hokage",
      description:
        "Granddaughter of the First Hokage and the greatest medical ninja in history. Her monstrous strength and healing make her a Legendary Sannin.",
      abilities: ["Strength of a Hundred Seal", "Medical Ninjutsu", "Superhuman Strength", "Summoning: Katsuyu"],
      rarity: "EPIC",
      powerLevel: 85,
    },
    {
      slug: "orochimaru",
      name: "Orochimaru",
      title: "The Snake Sannin",
      description:
        "A brilliant but twisted Sannin obsessed with uncovering every jutsu and achieving immortality. Founder of the Hidden Sound Village.",
      abilities: ["Living Corpse Reincarnation", "Curse Mark", "Summoning: Manda", "Sword of Kusanagi"],
      rarity: "EPIC",
      powerLevel: 86,
    },
    {
      slug: "gaara",
      name: "Gaara",
      title: "The Fifth Kazekage",
      description:
        "Former host of the One-Tail who rose from loneliness to become Kazekage of the Hidden Sand. His sand moves on its own to shield him from harm.",
      abilities: ["Sand Coffin", "Absolute Defense", "Sand Burial", "Shukaku's Power"],
      rarity: "EPIC",
      powerLevel: 84,
    },
    {
      slug: "might-guy",
      name: "Might Guy",
      title: "Sublime Green Beast of Prey",
      description:
        "Kakashi's self-proclaimed eternal rival and a taijutsu master. By opening all Eight Inner Gates he pushed Madara to his limit.",
      abilities: ["Eight Inner Gates", "Night Guy", "Morning Peacock", "Leaf Hurricane"],
      rarity: "EPIC",
      powerLevel: 89,
    },
    {
      slug: "kisame-hoshigaki",
      name: "Kisame Hoshigaki",
      title: "Tailless Tailed Beast",
      description:
        "One of the Seven Ninja Swordsmen of the Mist and Itachi's Akatsuki partner. His sword Samehada devours chakra.",
      abilities: ["Samehada", "Water Prison Shark Dance", "Shark Fusion", "Huge Chakra Reserves"],
      rarity: "EPIC",
      powerLevel: 82,
    },
    {
      slug: "hinata-hyuga",
      anilistId: 1555,
      name: "Hinata Hyuga",
      title: "Gentle Heiress",
      description:
        "Heiress of the Hyuga clan whose quiet determination was inspired by Naruto. Her Byakugan sees through nearly anything.",
      abilities: ["Byakugan", "Gentle Fist", "Twin Lion Fists", "Protection of the Eight Trigrams"],
      rarity: "RARE",
      powerLevel: 70,
    },
    {
      slug: "sakura-haruno",
      name: "Sakura Haruno",
      title: "Medical Ninja of Team 7",
      description:
        "Trained by Tsunade, she combines pinpoint chakra control with devastating strength and became one of the best medical ninja of her generation.",
      abilities: ["Medical Ninjutsu", "Chakra-Enhanced Strength", "Strength of a Hundred Seal", "Genjutsu Detection"],
      rarity: "RARE",
      powerLevel: 74,
    },
    {
      slug: "rock-lee",
      name: "Rock Lee",
      title: "Handsome Devil of the Leaf",
      description:
        "Unable to use ninjutsu or genjutsu, he devoted himself entirely to taijutsu under Might Guy and proved that hard work can rival genius.",
      abilities: ["Eight Inner Gates", "Primary Lotus", "Leaf Hurricane", "Drunken Fist"],
      rarity: "RARE",
      powerLevel: 76,
    },
    {
      slug: "shikamaru-nara",
      name: "Shikamaru Nara",
      title: "Strategist of the Leaf",
      description:
        "A lazy genius with an IQ over 200. He turns battles into games of shogi, trapping enemies with his clan's shadow techniques.",
      abilities: ["Shadow Possession", "Shadow Neck Bind", "Tactical Genius", "Shadow Sewing"],
      rarity: "RARE",
      powerLevel: 72,
    },
    {
      slug: "neji-hyuga",
      anilistId: 1694,
      name: "Neji Hyuga",
      title: "Prodigy of the Hyuga",
      description:
        "A branch-family genius who once believed fate could not be changed. After his fight with Naruto he chose his own path.",
      abilities: ["Byakugan", "Eight Trigrams Rotation", "Sixty-Four Palms", "Air Palm"],
      rarity: "RARE",
      powerLevel: 73,
    },
    {
      slug: "deidara",
      name: "Deidara",
      title: "Mad Bomber of the Akatsuki",
      description:
        "A rogue ninja from the Hidden Stone who believes art is an explosion. He moulds explosive clay with the mouths on his palms.",
      abilities: ["Explosion Release", "C2 Dragon", "C4 Karura", "Clay Birds"],
      rarity: "RARE",
      powerLevel: 78,
    },
    {
      slug: "kiba-inuzuka",
      name: "Kiba Inuzuka",
      title: "Beast Mimicry Brawler",
      description:
        "A hot-headed member of Team 8 who fights in perfect sync with his ninja dog Akamaru.",
      abilities: ["Fang Over Fang", "Man Beast Clone", "Enhanced Smell", "Two-Headed Wolf"],
      rarity: "COMMON",
      powerLevel: 62,
    },
    {
      slug: "choji-akimichi",
      anilistId: 2008,
      name: "Choji Akimichi",
      title: "Heart of Team 10",
      description:
        "A kind-hearted member of Team 10 whose loyalty to his friends is unshakable. His clan converts calories into raw power.",
      abilities: ["Expansion Jutsu", "Human Boulder", "Butterfly Mode", "Three Coloured Pills"],
      rarity: "COMMON",
      powerLevel: 65,
    },
    {
      slug: "ino-yamanaka",
      name: "Ino Yamanaka",
      title: "Mind Walker of Team 10",
      description:
        "Sakura's friendly rival and a sensor of the Yamanaka clan. She can transfer her mind into others to control or read them.",
      abilities: ["Mind Body Switch", "Mind Transmission", "Sensory Technique", "Medical Ninjutsu"],
      rarity: "COMMON",
      powerLevel: 60,
    },
    {
      slug: "iruka-umino",
      name: "Iruka Umino",
      title: "Academy Sensei",
      description:
        "The Academy teacher who was the first to truly acknowledge Naruto. Patient, brave and endlessly proud of his students.",
      abilities: ["Academy Fundamentals", "Trap Setting", "Shadow Clone Jutsu", "Teaching"],
      rarity: "COMMON",
      powerLevel: 48,
    },
  ],
};
