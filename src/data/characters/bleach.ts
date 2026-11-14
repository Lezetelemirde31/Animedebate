import type { AnimeCharacterSet } from "./types";

export const bleachCharacters: AnimeCharacterSet = {
  animeId: "bleach",
  characters: [
    {
      slug: "ichigo-kurosaki",
      name: "Ichigo Kurosaki",
      title: "Substitute Soul Reaper",
      description:
        "A teenager who can see ghosts and became a Soul Reaper to protect his family. With Soul Reaper, Hollow and Quincy powers within him, his growth knows no limit.",
      abilities: ["Getsuga Tenshō", "Bankai: Tensa Zangetsu", "Hollowfication", "Flash Step"],
      rarity: "MYTHIC",
      powerLevel: 97,
    },
    {
      slug: "sosuke-aizen",
      name: "Sōsuke Aizen",
      title: "Lord of Las Noches",
      description:
        "A former captain who orchestrated a century-long betrayal of the Soul Society. His Zanpakutō controls the senses of anyone who sees its release.",
      abilities: ["Kyōka Suigetsu", "Hōgyoku Fusion", "Black Coffin", "Master of Kidō"],
      rarity: "MYTHIC",
      powerLevel: 98,
      searchName: "Sousuke Aizen",
    },
    {
      slug: "yhwach",
      name: "Yhwach",
      title: "Father of the Quincy",
      description:
        "Emperor of the Wandenreich and progenitor of all Quincy. He sees and rewrites the future with The Almighty.",
      abilities: ["The Almighty", "Auswählen", "Blut", "Soul Distribution"],
      rarity: "MYTHIC",
      powerLevel: 99,
    },
    {
      slug: "genryusai-yamamoto",
      name: "Genryūsai Shigekuni Yamamoto",
      title: "Captain-Commander",
      description:
        "Founder of the Gotei 13 and its commander for a thousand years. His flames are the most powerful fire-type Zanpakutō in existence.",
      abilities: ["Ryūjin Jakka", "Bankai: Zanka no Tachi", "Ittō Kasō", "Master Swordsmanship"],
      rarity: "MYTHIC",
      powerLevel: 96,
      searchName: "Genryuusai Shigekuni Yamamoto",
    },
    {
      slug: "byakuya-kuchiki",
      name: "Byakuya Kuchiki",
      title: "Captain of the 6th Division",
      description:
        "Head of the noble Kuchiki clan, bound by duty and pride. His blade scatters into a thousand cherry-blossom petals.",
      abilities: ["Senbonzakura", "Bankai: Senbonzakura Kageyoshi", "Flash Step Mastery", "Kidō"],
      rarity: "LEGENDARY",
      powerLevel: 88,
    },
    {
      slug: "kenpachi-zaraki",
      name: "Kenpachi Zaraki",
      title: "Captain of the 11th Division",
      description:
        "A battle-hungry captain who lives only for fighting worthy opponents. His spiritual pressure is overwhelming even without his Zanpakutō's name.",
      abilities: ["Nozarashi", "Overwhelming Reiatsu", "Kendō", "Monstrous Endurance"],
      rarity: "LEGENDARY",
      powerLevel: 93,
    },
    {
      slug: "ulquiorra-cifer",
      name: "Ulquiorra Cifer",
      title: "Cuarta Espada",
      description:
        "The nihilistic 4th Espada who embodies emptiness. Only he among the Espada possesses a second release form.",
      abilities: ["Murciélago", "Segunda Etapa", "Lanza del Relámpago", "Cero Oscuras"],
      rarity: "LEGENDARY",
      powerLevel: 90,
    },
    {
      slug: "kisuke-urahara",
      name: "Kisuke Urahara",
      title: "Hat-and-Clogs",
      description:
        "A former 12th Division captain and founder of the Department of Research and Development. A genius inventor always several steps ahead.",
      abilities: ["Benihime", "Bankai: Kannonbiraki Benihime Aratame", "Kidō Mastery", "Genius Inventions"],
      rarity: "LEGENDARY",
      powerLevel: 91,
    },
    {
      slug: "shunsui-kyoraku",
      name: "Shunsui Kyōraku",
      title: "Captain-Commander of the Gotei 13",
      description:
        "A laid-back captain with a straw hat and pink kimono who hides a sharp mind. His twin blades turn children's games into deadly rules.",
      abilities: ["Katen Kyōkotsu", "Bankai: Karamatsu Shinjū", "Dual Wielding", "Flash Step"],
      rarity: "LEGENDARY",
      powerLevel: 92,
      searchName: "Shunsui Kyouraku",
    },
    {
      slug: "yoruichi-shihoin",
      name: "Yoruichi Shihōin",
      title: "Flash Goddess",
      description:
        "Former captain of the 2nd Division and head of the Shihōin clan. The fastest in the Soul Society, she can also take the form of a black cat.",
      abilities: ["Shunkō", "Flash Step", "Hakuda Mastery", "Cat Transformation"],
      rarity: "LEGENDARY",
      powerLevel: 88,
      searchName: "Yoruichi Shihouin",
    },
    {
      slug: "rukia-kuchiki",
      name: "Rukia Kuchiki",
      title: "The Soul Reaper Who Started It All",
      description:
        "The Soul Reaper whose powers transformed Ichigo's life. Her ice Zanpakutō is said to be the most beautiful in the Soul Society.",
      abilities: ["Sode no Shirayuki", "Bankai: Hakka no Togame", "Kidō", "Absolute Zero"],
      rarity: "EPIC",
      powerLevel: 82,
    },
    {
      slug: "toshiro-hitsugaya",
      name: "Tōshirō Hitsugaya",
      title: "Captain of the 10th Division",
      description:
        "A child prodigy who became the youngest captain in history. He commands the strongest ice-type Zanpakutō.",
      abilities: ["Hyōrinmaru", "Bankai: Daiguren Hyōrinmaru", "Ice Dragon", "Flash Step"],
      rarity: "EPIC",
      powerLevel: 85,
      searchName: "Toushirou Hitsugaya",
    },
    {
      slug: "grimmjow-jaegerjaquez",
      name: "Grimmjow Jaegerjaquez",
      title: "Sexta Espada",
      description:
        "The violent 6th Espada who embodies destruction. Obsessed with defeating Ichigo, he is a predator through and through.",
      abilities: ["Pantera", "Desgarrón", "Gran Rey Cero", "Sonído"],
      rarity: "EPIC",
      powerLevel: 86,
    },
    {
      slug: "gin-ichimaru",
      name: "Gin Ichimaru",
      title: "Former 3rd Division Captain",
      description:
        "A perpetually smiling captain who followed Aizen. Behind his snake-like grin he hid a single purpose all along.",
      abilities: ["Shinsō", "Bankai: Kamishini no Yari", "Flash Step", "Deception"],
      rarity: "EPIC",
      powerLevel: 87,
    },
    {
      slug: "uryu-ishida",
      name: "Uryū Ishida",
      title: "The Last Quincy",
      description:
        "A proud Quincy and Ichigo's rival-turned-ally. His precise spirit-bow archery and later Schrift make him a formidable threat.",
      abilities: ["Spirit Bow", "Seele Schneider", "Hirenkyaku", "Antithesis"],
      rarity: "EPIC",
      powerLevel: 82,
      searchName: "Uryuu Ishida",
    },
    {
      slug: "coyote-starrk",
      name: "Coyote Starrk",
      title: "Primera Espada",
      description:
        "The strongest Espada, who embodies solitude. He split his soul in two with Lilynette to escape loneliness.",
      abilities: ["Los Lobos", "Cero Metralleta", "Spirit Wolves", "Dual Pistols"],
      rarity: "EPIC",
      powerLevel: 89,
    },
    {
      slug: "mayuri-kurotsuchi",
      name: "Mayuri Kurotsuchi",
      title: "Captain of the 12th Division",
      description:
        "The twisted head of research and development. He treats every battle as an experiment and always has a contingency.",
      abilities: ["Ashisogi Jizō", "Bankai: Konjiki Ashisogi Jizō", "Super-Drugs", "Body Modification"],
      rarity: "EPIC",
      powerLevel: 84,
    },
    {
      slug: "renji-abarai",
      name: "Renji Abarai",
      title: "Lieutenant of the 6th Division",
      description:
        "Rukia's childhood friend from the Rukongai. Hot-blooded and loyal, he fights with a segmented snake-tail blade.",
      abilities: ["Zabimaru", "Bankai: Sōō Zabimaru", "Hikotsu Taihō", "Kidō"],
      rarity: "RARE",
      powerLevel: 80,
    },
    {
      slug: "soi-fon",
      name: "Soi Fon",
      title: "Captain of the 2nd Division",
      description:
        "Commander-in-Chief of the Onmitsukidō and Yoruichi's devoted former protégée. Her stinger kills in two strikes.",
      abilities: ["Suzumebachi", "Nigeki Kessatsu", "Shunkō", "Bankai: Jakuhō Raikōben"],
      rarity: "RARE",
      powerLevel: 80,
    },
    {
      slug: "rangiku-matsumoto",
      name: "Rangiku Matsumoto",
      title: "Lieutenant of the 10th Division",
      description:
        "Hitsugaya's carefree lieutenant who loves sake and slacking off. Her blade dissolves into a cloud of razor-sharp ash.",
      abilities: ["Haineko", "Ash Cloud", "Kidō", "Flash Step"],
      rarity: "RARE",
      powerLevel: 72,
    },
    {
      slug: "ikkaku-madarame",
      name: "Ikkaku Madarame",
      title: "3rd Seat of the 11th Division",
      description:
        "A bald, battle-loving warrior who hides his Bankai so he can die fighting under Kenpachi.",
      abilities: ["Hōzukimaru", "Bankai: Ryūmon Hōzukimaru", "Spear Mastery"],
      rarity: "RARE",
      powerLevel: 74,
    },
    {
      slug: "yasutora-sado",
      name: "Yasutora Sado",
      title: "Chad",
      description:
        "Ichigo's gentle giant of a friend who only fights for others. His arms transform into a giant's and a devil's.",
      abilities: ["Brazo Derecha de Gigante", "Brazo Izquierda del Diablo", "El Directo", "La Muerte"],
      rarity: "RARE",
      powerLevel: 72,
    },
    {
      slug: "orihime-inoue",
      name: "Orihime Inoue",
      title: "Princess of the Shun Shun Rikka",
      description:
        "Ichigo's kind-hearted classmate whose hairpins house six fairies. Her power rejects events, undoing what has happened.",
      abilities: ["Sōten Kisshun", "Santen Kesshun", "Koten Zanshun", "Event Rejection"],
      rarity: "RARE",
      powerLevel: 66,
    },
    {
      slug: "yumichika-ayasegawa",
      name: "Yumichika Ayasegawa",
      title: "5th Seat of the 11th Division",
      description:
        "A vain fighter obsessed with beauty who hides his Zanpakutō's true kidō-type nature from his own division.",
      abilities: ["Fuji Kujaku", "Ruri'iro Kujaku", "Reiatsu Drain"],
      rarity: "COMMON",
      powerLevel: 68,
    },
    {
      slug: "ganju-shiba",
      name: "Ganju Shiba",
      title: "Boar-Riding Fireworks Expert",
      description:
        "A loud Rukongai brawler from the Shiba clan who helped Ichigo invade the Soul Society, riding his boar Bonnie.",
      abilities: ["Earth Manipulation", "Fireworks Cannon", "Boar Riding"],
      rarity: "COMMON",
      powerLevel: 50,
    },
    {
      slug: "hanataro-yamada",
      name: "Hanatarō Yamada",
      title: "7th Seat of the 4th Division",
      description:
        "A timid medic who bravely helped Ichigo through the Soul Society. His Zanpakutō absorbs damage to heal others.",
      abilities: ["Hisagomaru", "Healing Kidō", "Sewer Navigation"],
      rarity: "COMMON",
      powerLevel: 35,
      searchName: "Hanatarou Yamada",
    },
    {
      slug: "kon",
      name: "Kon",
      title: "Mod Soul",
      description:
        "An artificial Mod Soul who lives in a plush lion and takes over Ichigo's body when he's away. Loud, perverted and secretly loyal.",
      abilities: ["Enhanced Legs", "Body Takeover", "Plushie Disguise"],
      rarity: "COMMON",
      powerLevel: 30,
    },
  ],
};
