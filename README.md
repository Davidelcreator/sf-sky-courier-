# SF Sky Courier 🚗✨

A flying-car delivery game set in the **real San Francisco** — real streets
and real 3D buildings, rendered from free OpenStreetMap data.

Drive along the streets, or hold **SPACE** and fly over them. Deliver
packages to glowing beacons at real Bay Area landmarks. Buildings are
solid until you climb above their roofs — and yes, you can land on them.

## Controls

| Key            | Action                  |
| -------------- | ----------------------- |
| `W` / `↑`      | Accelerate              |
| `S` / `↓`      | Brake / reverse         |
| `A` `D` / `←` `→` | Steer                |
| `SPACE` (hold) | Upward thrust — fly!    |
| `G`            | Toggle HOVER / GLIDE flight |
| `C`            | Cycle camera angle (chase, close, sky, top-down, cinema) |
| `V`            | Switch vehicle (sky car / UFO — the UFO tops out ~940 mph) |
| drag / swipe   | Look around (orbit the camera) |
| `B`            | Toggle satellite imagery / drawn map |
| mouse wheel    | Zoom the camera in/out  |
| `R`            | Reset back to the start |

In **GLIDE** mode your forward speed generates lift, so at full speed
you sail nearly flat across the city; slow down and you sink. **HOVER**
is the default: gravity always pulls, thrust fights it.

On phones and tablets, on-screen controls appear automatically: a
joystick on the left (push to steer, and up/down to accelerate/brake)
and a **FLY** button on the right.

## Run it locally

You need any local web server (opening `index.html` directly from the
file system won't work — browsers block JavaScript modules on `file://`
URLs for security). With [Node.js](https://nodejs.org) installed:

```
node server.js
```

(or any other static server, e.g. `npx http-server -p 8080`)

Then open <http://localhost:8080> in your browser.

## How it's built

- **[MapLibre GL JS](https://maplibre.org/)** renders the real city:
  streets, labels, and 3D buildings extruded to their true heights.
- Map data comes from **[OpenStreetMap](https://www.openstreetmap.org)**
  via **[OpenFreeMap](https://openfreemap.org)** — free, no API key.
- **[three.js](https://threejs.org/)** draws the car, the beacon beam and
  the drop shadow *inside* the map's own 3D scene (a MapLibre
  "custom layer"), so buildings correctly hide the car behind them.
- No build step, no framework: plain HTML/CSS/JavaScript. All the game
  logic is in [`js/main.js`](js/main.js); every tuning knob (physics,
  camera, beacon locations) is in [`js/config.js`](js/config.js).

## Add your own delivery spots

Open `js/config.js`, right-click anywhere on Google Maps to copy its
coordinates, and add an entry to `BEACONS` — note the order is
`[longitude, latitude]` (Google shows latitude first!).

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, tiles by [OpenFreeMap](https://openfreemap.org).
