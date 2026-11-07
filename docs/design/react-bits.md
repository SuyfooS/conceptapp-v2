# React Bits: what fits this app

Orel keeps [React Bits](https://reactbits.dev/get-started/index) as a source of ideas for a premium look (7 November 2026). Source: [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), under `src/ts-tailwind/<Category>/<Name>/`.

## How to use it

- **Take the idea, not the package.** Its components need `motion/react`, and some need WebGL. Rebuild on CSS and our tokens in `packages/ui`, as `CodeSlots` was. Speed is a feature here: Orel called slow pages terrible.
- **Check it works by touch.** Staff use phones, and many effects there respond to a mouse hover.
- **Motion on state changes only** (`CLAUDE.md`), and reduced motion turns it off.
- **Licence:** MIT + Commons Clause. Fine inside the app, not for selling or redistributing the components. `packages/ui/README.md` carries the credit.

## Taken

| React Bits | In the app | Where |
|---|---|---|
| Code Slots | `CodeSlots` | SMS code, on sign-in and join |
| Fade Content | the page fades in over its skeleton | `PageBody` |
| Rubber Segment | `Segmented`: the lens slides with a spring | This week and next, on the schedule |
| Spring Check | the check fills and draws itself | `ChoiceRow` |
| Count Up | `useCountUp`, when a number changes | Hours in the history and the clock |
| Squish Switch | `Switch`: the thumb squashes under the finger and springs across | Settings, and modules in the console |

## Waiting for their screen

| React Bits | For | When |
|---|---|---|
| Spring Check, as a checkbox | Ticking off items | Lists |
| Swipe Row | Tick or act on a row with a swipe | Lists, then shifts |
| Swipe Toast | A toast with undo, swiped away | The first deletion that offers undo |
| Status Mark | Saving, then saved, on a button | The publish moment |
| Hold Button | Press and hold for what can't be undone | If such an action appears |
| Stepper | Steps of a long setup | The new-business wizard |
| Warm Tooltip | Tooltips for icon buttons on desktop | When the native `title` isn't enough |

## For the landing page, not the app

Soft Aurora, Grainient, Silk, Light Rays and similar backgrounds; Blur Text, Split Text, Shiny Text and Scroll Reveal for headlines; Tilted Card and Logo Loop. Most of the backgrounds are WebGL, which is too heavy for a working screen on a phone but fine for one marketing page.

## Left out, and why

- **Glass Surface, Fluid Glass:** real refraction uses SVG filters that Safari doesn't apply to what's behind an element, so iPhones would get only the blur we already have.
- **Spotlight Card, Border Glow, Magic Bento, Glare Hover, Tilted Card:** they answer a mouse. A phone sees nothing.
- **Dock, Gooey Nav, Pill Nav, Card Nav, Bubble Menu:** we already have the tab bar and sidebar, and the rules ask for the same navigation everywhere.
- **Cursor effects and other 3D:** no use on a phone, and against "motion on state changes only".
