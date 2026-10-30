// The word lists, written in ROT13 (every letter moved 13 places) so this file reads as nonsense to a kid
// looking at the code. src/index.js turns them back when the module loads. To add a word: ROT13 it, e.g.
//   node -e "console.log(process.argv[1].replace(/[a-z]/g,c=>String.fromCharCode((c.charCodeAt(0)-84)%26+97)))" word
// and put it in the right list. Only a-z letters (names are folded to plain lower-case letters first).
// Categories: English swear words, rude body words, slurs and hate words, a few common Portuguese swear words.

/** Bad even inside a longer word ("xxWORDxx"). Only words that hide in no normal word (or whose normal word is in ALLOW). */
export const ANYWHERE = Object.freeze(['shpx', 'shx', 'spx', 'cuhpx', 'fuvg', 'ovgpu', 'ovngpu', 'phag', 'juber', 'fyhg', 'avttre', 'avttn', 'snttbg', 'sntbg', 'nffubyr', 'nefrubyr', 'qvpxurnq', 'pbpxfhpxre', 'zbgures', 'onfgneq', 'obyybpxf', 'jnaxre', 'wvmm', 'qvyqb', 'intvan', 'cbea', 'zvys', 'uvgyre', 'gjng', 'qhzonff', 'wnpxnff', 'ohyyfu', 'pnenyub', 'sbqnfr', 'sbqnffr', 'ohprgn', 'cvebpn', 'pnprgr', 'neebzonq', 'intnohaqn', 'zreqn', 'svyunqnchgn', 'svyubqnchgn', 'chgndhrbcnevh']);

/** Bad only as a whole part of the name (split by _, spaces, numbers or CamelCase), plus s/es/y/ed/ing/er endings. */
export const WHOLE = Object.freeze(['nff', 'nefr', 'qvpx', 'pbpx', 'gvg', 'gvgf', 'gvggl', 'gvggvrf', 'obbo', 'obbof', 'cvff', 'penc', 'qnza', 'frk', 'frkl', 'nany', 'cravf', 'phz', 'phzfubg', 'encr', 'encvfg', 'anmv', 'snt', 'ergneq', 'xlf', 'xxx', 'jnax', 'chffl', 'chffvrf', 'fcvp', 'puvax', 'xvxr', 'pbba', 'genaal', 'ubeal', 'crqb', 'crqbcuvyr', 'jgs', 'fgsh', 'szy', 'ohttre', 'ubr', 'fxnax', 'qbhpur', 'chgn', 'chgb', 'cbeen', 'sbqn', 'sqc', 'cdc', 'ifs', 'ivnqb', 'obfgn', 'pbeab', 'phmnb', 'ebyn', 'kbgn', 'kbkbgn']);

/** Normal words that contain an ANYWHERE word (the "Scunthorpe problem"). They are taken out before checking. Plain text. */
export const ALLOW = Object.freeze([
  'scunthorpe', 'shitake', 'shiitake', 'shiitakes', 'shitakes', 'pushit', 'mishit',
  'water', 'sushi', 'shitzu', 'shihtzu', 'matsushita', 'fukushima', 'spicy', 'cocky',
]);

/** ROT13 back to the plain word (tests use it to make rude test names without writing them). */
export const decodeWord = w => w.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
