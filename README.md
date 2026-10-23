# MX-5 Odyssey

Open-world browser game with a 1991 Mazda MX-5 (NA) that transforms into a boat and a plane.
Three.js r160 (loaded from jsDelivr via import map), no build step.

## Run locally

ES modules need an HTTP server:

```sh
cd mx5-game
npx serve .        # or: python3 -m http.server 8000
```

Open the printed URL, click **Drive**.

The page loads the bundled `game.js`. After editing `src/`, rebuild it with `npm install && npm run build`.

## Controls

| Key | Roadster | Boat | Plane |
|---|---|---|---|
| W / S | throttle / brake (hold S at a stop to reverse) | outboard forward / reverse | throttle lever up / down |
| A / D | steer | steer | roll (nosewheel steering on the ground) |
| ↑ / ↓ | throttle / brake | — | pitch down / up |
| Q / E | — | — | rudder |
| Space | handbrake | — | wheel brakes |

Anywhere: `1 2 3 4` transform · `0` photo mode · `L` pop-up headlights · `C` camera · drag to look · `M` map · `N`/`B` time ±1 h ·
`R` recover to nearest road · `X` repair (and fresh tyres) · `T` traffic · `G` auto/manual gearbox (Shift/Ctrl to shift) · `F` flight assist ·
`U` sound · `P` graphics quality · `I` tyre/brake telemetry · `H` help. Letter shortcuts follow the printed key (AZERTY works); driving keys are positional (ZQSD on AZERTY).

## World (4 × 4 km, procedural, seeded)

- **Plains** (centre), **Forest** (west, with a lake), **Desert** (east, dunes + mesas, oasis lake),
  **Mountains** (north, ridged peaks with snow above ~350 m), **Sea** (south and around the island edge).
- A river runs from the mountain foothills to the sea; roads cross it on bridges.
- Roads: a highway loop through every biome plus a mountain pass, desert, coast, forest and central road.
  Roads are graded (grade-limited profile) and cut/filled into the terrain.

## Physics (`src/physics.js`, 600 Hz fixed step)

- 6-DOF rigid body with gyroscopic term; mass 1030 kg (+190 kg boat kit, +150 kg plane kit).
- Raycast suspension per wheel (spring, damper, anti-roll bars, bump stops) on the exact terrain triangulation.
- Combined-slip tyre model (normalised slip, magic-formula shape), per-surface grip: asphalt, grass, sand, rock, snow.
  Past the peak, grip falls ~20 % on asphalt and rock but not on grass or sand (a spinning tyre digs in).
- Pedal map: part throttle gives most of the low-rev torque; pulling away slips the clutch at 1500-2600 rpm.
- Steering lock narrows with speed to what the front tyres can use, so full input turns hard instead of ploughing.
- Sim-arcade adds a light traction control. Realistic has none (like the real NA): feather the throttle on grass.
- Drivetrain: B6-ZE torque curve (136 Nm @ 5500, 116 PS @ 6500), real NA gear ratios (3.136 / 1.888 / 1.330 / 1.000 / 0.814, final 4.3),
  clutch slip at launch, engine braking, viscous LSD, auto or manual shifting.
- Water: column buoyancy against the same wave function the water shader uses, anisotropic hull drag,
  steerable outboard thrust. In roadster mode the cabin floods and the car sinks; switching to boat pumps it out.
- Air: each wing, the tailplane and the fin are lifting surfaces with their own local airflow (so stability and damping
  come out of the geometry), stall, induced drag, ailerons/elevator/rudder, prop thrust limited by power. Optional wing leveller.
- Collisions: body vs ground (rollovers, belly landings), trees/rocks/cacti, AI traffic.

## Radio, soft top, controller, pause

- Radio (`src/radio.js`): stations composed live in the browser: **MX Metal 66.6** (Karplus-Strong guitars through an amp/cab
  chain, double-tracked, palm mutes, gallops, double-kick, solos), **Neon 89.1** (synthwave), **Late Night 101.3** (lo-fi jazz),
  and **Your Music**, which plays audio files picked from your computer (they stay on your device). `K` next station,
  `J` next song, `+`/`−` volume; D-pad up on a controller (volume in the pause menu).
- Indicators: `Q`/`E` (AZERTY `A`/`E`), `O` hazards; D-pad left/right/down. They cancel themselves after the turn,
  with relay clicks. Reversing lamps light in reverse.
- Soft top: `V` raises/lowers it below 10 km/h (the model's own top folds back over a hinge behind the seats; side windows wind up);
  wind noise drops with the top up.
- Controller (standard mapping): LS steer, RT/LT throttle/brake (plane: throttle lever, LS roll/pitch, LB/RB rudder),
  X handbrake, B horn (twin electric disc horns), Y headlights, A transform, RB/LB gears, RS look, RS click top, LS click camera, Back map, Start pause.
- Pause (`Esc` / Start): driving model Realistic or Sim-arcade (no tyre temperature/wear effects, no brake fade),
  graphics quality, radio, sound, recover, repair. Settings are remembered in this browser.

## Car model

`mx5v2.glb` is based on ["1989 Mazda MX-5 (NA)"](https://sketchfab.com/3d-models/1989-mazda-mx-5-na-bd6429f3d02a426f9a714a66c33bb353)
by [Res1n](https://sketchfab.com/Res1n), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Changes: converted to body space (metres from the 2.265 m wheelbase, front +z), split into parts by connected component
(`body`, `popup_L/R` on their hinges, `wheel_*`, `caliper_*`, `mirror_*`, `tail_*`, `front_*`, `steer`, `windscreen`,
`softtop`, `window_*`), non-paint parts simplified, quantized and meshopt-compressed.
Regenerate: `tools/export_v2.js` (bundled, run in a browser next to the Sketchfab `scene.gltf`) writes `raw2.glb`, then
`SKIP=':carpaint$' node tools/compress_v2.mjs raw2.glb mx5v2.glb 0.0005` and `base64 -w0 mx5v2.glb > mx5v2.glb.txt`.
The soft top is the model's own roof, folded about a hinge behind the seats; the door glass winds down into the doors.

Fallbacks: `mx5.glb(.txt)` (the earlier model converted from a user-supplied FBX), then the procedural car in `src/car.js`.
Both GLBs ship as base64 text because the artifact host only serves web file types.

## Rendering

- Ground: tileable PBR detail textures (albedo + normal) for grass, forest floor, sand, rock (triplanar), snow and asphalt,
  generated by `tools/gen_textures.py` and blended per vertex by biome. Replace the JPEGs in `textures/` with photo-scanned
  ones (same names) for even more realism; `means.json` holds each texture's average colour.
- Lighting: image-based lighting from CC0 Poly Haven sky panoramas (via `@pmndrs/assets`, `src/hdri/`), day/dusk/night
  blended by sun height and rotated to the sun.
- Post-processing (`src/postfx.js`): GTAO ambient occlusion, bloom, speed blur; quality High/Medium/Low (`P`) with automatic
  step-down when the frame rate is low.
- Tyre marks (`src/skidmarks.js`) and dust trails off-road.
- Rounded shapes: the procedural car bodies (traffic, parked cars, the Strada GT, the police car, ferry cars) are
  extruded from filleted side profiles and then bent: sides bow out at the waist and tuck in at the sill, the glasshouse
  leans in toward the roof, the ends round off in plan and bonnet/roof/boot are crowned; tyres have rounded shoulders.
  The hundreds of cars parked in the raceway infield use a lighter version (~700 triangles each, no shadows). One-off
  props and buildings use soft-edged boxes (`src/shapes.js`).
- Town facades (shader): framed windows with sills, mullions, sky reflections and the odd curtain; plaster or brick
  (fading out with distance), a cornice at every floor, gravel on flat roofs; pitched roofs get tile courses and
  pavements get slab joints.

## Driving model additions

Tyre temperature (grip peaks around 80 °C), tyre wear, load sensitivity, camber from suspension travel and body roll
(double-wishbone gain, camber thrust), and brake fade above ~400 °C. Air temperature follows biome and time of day.

Crash damage: dents (lamps dent with the bumper), broken lamps/mirrors/pop-ups, windscreen cracks, bent toe/camber,
bent rims (wobble, vibration, pulling), wheels shoved back or inward on their mounts, wheels that hang loose (sagging,
wobbling, less grip) before they tear off, bumper covers that tear off on big hits (revealing the beam and radiator),
doors and the boot lid that spring open and swing with the car's motion, and a bonnet that buckles (a crease rises up
the middle) and, once its latch goes, lifts at speed onto the windscreen. `X` or the pause menu repairs everything.

## Mech mode

`4` (or A on a controller, cycling modes) transforms the roadster into a ~3.9 m robot made from its own shell, which is
cut into sections joined by hinges and slides (`src/transformer.js`): the car and the robot are two poses of one
mechanism and each joint moves on its own schedule (~2.6 s, servo whine). The doors swing open and the car rears up on its
tail; the rear splits down the middle into legs that twist half a turn (wheels end up on the calves) and slide out on
chrome struts, feet folding out of the bumper halves; the torso rises on a telescoping waist while the front end
swings down under the floor to become the chest (its nose, with the pop-ups and bumper, tucks in behind it and the chest sits back into the torso); arms slide out of the door apertures, the doors rise into wings, the soft
top closes over the cockpit (the robot's back), the boot lid flips onto the back and the head rises out of the dashboard.
W/S walk (up to 6.5 m/s, slower wading), A/D turn, `Space` (controller X) jumps and holding it fires the back-pack jets.
Footfalls thump and shake the camera; it walks along the sea bed. `F` (controller RB) throws a right hook that fells
trees, sends traffic flying and dents the fist on rocks; hard landings end in a superhero landing (down on one knee, fist
driven into the ground, other arm raised) that cracks the ground with electric arcs, flattens trees and shoves cars away;
falls from ~40 m dent the legs and make it limp (slower, shorter left stride) until repaired. The pop-up lamps glow as
eyes and a head-mounted beam lights the way when the headlights are on. Choosing plane while the robot stands makes it crouch, leap, pirouette and transform at
the top of the jump, blasting off as a plane (`src/impactfx.js` draws the cracks and arcs). Switching between mech and
plane in the air snaps through quickly: a falling robot sprouts wings and launches forward at ~110 km/h, a plane folds into a robot that
drops and lands on its feet. (Without the detailed model, `src/mech.js` builds a
simpler kit-bashed robot.)

**Weapons** (`src/weapons.js`, detailed model): `Q` (`A` on AZERTY, controller LB) deploys the **arm cannon**. The
left fist retracts into the forearm, two armour flaps swing open, a barrel slides out past the fist and the energy
coils light up; the arm then locks pointing ahead. With it out, `F` fires energy shells (tracer, muzzle flash, recoil)
instead of punching. `E` (controller R3) fires a **missile**: a six-tube pod rises out of the back above the right
shoulder and its cover flips up. Each missile boosts up out of its tube, homes on the nearest arena enemy ahead (or
the ground 70 m ahead) trailing smoke, and explodes (crater, flash, sparks, smoke). The pod reloads one missile every
2.5 s and stows itself after a few quiet seconds. Shells and missiles damage arena enemies, knock trees over, shove
traffic and burst on buildings and the ground.

The rides (motorbike, Strada GT, police car, van) collide with traffic, police cars, the street-racing MX-5s and the
parked roadster: they bounce off and the cars they hit get knocked aside. Traffic stops for whatever you're riding,
the parked MX-5 and the rival MX-5s; the rivals keep a gap behind traffic (and you) and only pull out to overtake
while street racing.

Roads: minor roads are pinned to the highway's deck height where they join or cross it and re-graded around the
junction, so decks meet flush; bridge approaches ramp up instead of stepping.

## Junctions

Wherever a road ends on another (`findJoins` in `src/world.js`), the side road's mesh stops short of the main road
and a plain-asphalt mouth follows its curve in, widening into curved corner flares (tight on the acute corner of an
angled junction, none on a shallow merge) and covering the main road's edge line across the opening; a dashed
give-way line is painted across the incoming lane. Heights already match at the joint. Country-road crossings away
from either road's end get a plain patch like the town crossings (no traffic lights). Traffic reaching the end of a
road turns left or right onto the road it joins (never a U-turn unless it's a real dead end), sometimes turns off
onto side roads along the way, slows for the turn and eases across into its new lane; the roaming rival MX-5s do the
same.

## GPS (`src/gps.js`)

`6` shows the in-car navigation screen (in place of the minimap), `7` opens **Where to?**: home, the current
objective, towns, fuel stations, garages, ferries, the cable car, railway stations, the airport and airstrip, the
raceway, Gull Bay and more, sorted by distance and filtered by category (arrows + Enter, or click). Clicking anywhere
on the big map (`M`) sets a destination there. The screen is styled like a phone-projection car display: an app dock
(search, radio, voice on/off, hide), a heading-up map that zooms out with speed (roads, your route in blue, the
destination pin), a green manoeuvre card with the distance and the road to turn onto (and a "then" chip when two
turns come close together), the speed limit for the road type with your speed (red when over), and an arrival bar
(arrival time on the game clock, minutes and km left). Routes are found with A* over the road network, with travel
times by road type; leave the route for a few seconds and it reroutes. Spoken prompts (browser speech synthesis) come
at ~600 m, ~200 m and at the turn. The route also shows on the minimap and the big map.

## Events (`src/events.js`)

- **Weekly board** (pause menu → Jobs), seeded by the ISO week so it changes every Monday: a time trial on a stretch
  of main road with six splits and your ghost (the clock starts at the first marker; weekly ghosts are cleared when
  the week rolls over), a drift target (bank one chain worth the target anywhere) and a town-to-town delivery. Each
  pays a bonus the first time it's done that week.
- **Hitchhikers**: now and then someone thumbs a lift on the verge ahead. Stop beside them and press F: the GPS sets
  itself to their destination (a town, the drive-in or the raceway), they chat on the way, complain if you go over
  ~150 km/h, and pay on arrival (more for a quick, calm ride).
- **Seasons**: in winter a Christmas market fills the festival field (chalets, a lit tree, string lights and an ice
  rink; F for a mulled cider); in summer a beach-party stage with moving lights and dancers sets up on the Gull Bay
  sand; in autumn the rally weekend arches go up at the stage starts and rally pay is ×1.5.
- **Night city**: three neon street races round the Fairfield blocks, after dark only, with neon arches over the
  corners and gold times. The **Starlight drive-in** east of Fairfield (levelled gravel lot, driveway from the
  road, speaker posts, snack bar) shows a film at night: stop in the lot to watch. Wet roads are glossier at night.
- **Postcards**: hint-only photo targets ("Port Ruby's cranes at dawn", "Silverpine Peaks dressed in snow"…) that
  need the right subject, distance, time of day, season or height. Saving a photo checks them; near misses tell you
  what's wrong. Selecting one in the menu points the GPS at the subject.

## Cockpit, dirt and the rogue mech

- `8` toggles a rear-view mirror strip (rendered from behind the car every other frame, flipped). In the cockpit
  camera the GPS sits on a phone mount on the dash.
- The car gets dirty off-road, faster in mud and rain; stop at any fuel station and press F for the car wash ($15).
- A rogue mech roams the open world; beat it in the mech for cash, and unlock weapon upgrades (faster reload after
  the first, a laser after the third). The shield upgrade shows as a hex bubble that flares on hits.
- The car cable car's summit has the Skyline loop: a short scenic road round the plateau, with a café and telescopes.

## Towns, fuel, missions, weather, garage, photo mode

- **Towns** (`src/towns.js`, layout in `src/world.js`): Fairfield (city), Port Ruby, Mesa and Pinewood sit on levelled
  plateaus. Each street grid is closed (cross streets at both ends), so every street ends at a junction; crossings get a
  plain asphalt patch, and pavements are cut back at every crossing. Roundabouts (kerbed islands with a fountain in the
  city, a tree elsewhere) sit where the inner streets cross. Buildings have parapets, rooftop plant, water tanks, masts,
  and shop fronts with awnings in the centres; windows light up at night. Their colliders reach their real height (a
  low-flying plane hits them) and their roofs are solid, so you can land on them.
- **Fuel stations**: paved forecourts levelled to the road and touching its edge (one per town, two highway services).
- **Fuel**: a 45 L tank (gauge by the cluster) burns with throttle; the plane and jets drink faster. Stop at a pump in
  any town station or the two highway services to refuel. Running dry stops the engine; `R` gives a 10 L can.
- **Missions** (pause menu): two town sprints, a fragile glassware delivery against the clock, a highway lap and a
  Grand Tour needing road, boat, plane and mech. Checkpoints show as beams/rings with an arrow on the HUD; bests are saved.
- **Weather** (pause menu: auto, clear, overcast, rain, storm, fog): rain streaks, lightning and thunder, wet roads that turn
  glossy and lose ~30 % grip, overcast skies, fog. Thunderstorms (likelier after dark in Auto) bring forked lightning
  every few seconds, thunder delayed by the strike's distance, and gusty wind.
- **Seasons** (pause menu: auto follows the real calendar, or pick one; `src/seasons.js`): spring blossom on the
  broadleaf trees; summer's drier grass and the **Fairfield summer festival** in the field north of town (big wheel,
  stalls, stage, food trucks, bunting, fireworks after dark); autumn gold grass and orange/red trees; winter snow on
  the ground and trees, bare branches, snowfall instead of rain, and **ice** (grip loss up the mountain pass, a little
  black ice anywhere on cold nights).
- **Floods** (`src/floods.js`): the low dips of the coast road and the central road fill with muddy water in heavy rain
  and storms, with warning signs. Water slows the car hard, and deep water gets into the engine.
- **Drift scoring**: slide at speed to score; link slides to build a ×5 multiplier; a crash loses the chain. The
  marked **drift zone** on the mountain pass (green arch to red arch) pays out and keeps your best.
- **Airport life and flying career** (`src/aviation.js`): baggage tugs with carts, a fuel bowser and a catering truck
  (its box lifts at the aircraft door) work the apron; pushback tugs wait at the gates. Land at Pilou and the yellow
  **follow-me** car meets you at the runway exit and leads you to stand 5. **Tower radio**: ground and tower clear you
  to taxi, take off and land (with the actual wind), and the Pilou Air flights call in; spoken with the browser's
  speech synthesis and subtitled (pause menu: Tower radio on/off). **Wind** now blows on the plane (gusty in storms;
  the HSI shows a wind arrow and WIND ddd/kt). **Licences**: student → private (pass the circuit test) → commercial
  (grade B or better in the **crosswind landing challenge**) → airline transport (8 flight jobs); passenger pay rises
  with the licence. **Cargo flights** (private licence) between Pilou's cargo apron and Mesa Field: the plane is
  heavier, and a hard landing damages the goods.
- **Rally stages** (`src/rally.js`, pause menu → Jobs): two gravel stages, *Riverside* (fast, with a water splash
  where it fords the river) and *Pinewood Forest* (narrow and twisty). Gravel has its own grip and throws up dust.
  A co-driver reads pace notes generated from the road (left/right 1–6, hairpin, long, into, crest, splash), spoken
  and shown on the stage HUD; spectators and tape at the big corners; best times saved, with a ghost car. `R`
  puts you back on the stage (+5 s).
- **Photo spots** (`src/photos.js`, green camera signs and map pins): stand by one, press `0`, frame the subject and
  save the photo (Enter). Each new spot pays $150; all of them pays a $1,000 bonus.
- **MX-5 Club meet** (`src/meet.js`): in the Silverpine Peaks car park every evening 17:00–23:00 and all day at weekends;
  a dozen club roadsters, lights and the gazebo. Park and stop: the judges score your car (upgrades, condition,
  paint) against the field, with prizes for the podium.
- **Mech story** (`src/arena.js`, Red Rock Quarry in the desert north of the raceway, pause menu → Jobs): five
  fights, each unlocking the next: Training (14 crates), Drone swarm (punch them when they dive), Twin scouts (small
  fast walkers), Turret line (four plasma turrets) and the Iron Golem (punch its glowing core, double damage while it
  winds up a stomp). Upgrades unlock along the way: a shield (−40% damage), a dash (`Shift` in the mech) and a ground
  pound (land hard from a jump or jet to blast everything within 10 m).
- **Other rides** (`src/rides.js`; pause menu → Ride, or `5` for the helicopter): a **motorbike** (leans into
  corners, jumps crests), the **Strada GT** coupe (faster, Space to slide it), a **jet ski** (spawns on the nearest
  water within 300 m; piers and the moored freighter are walls) and a **Pilou Air helicopter** (W/S collective, A/D
  yaw, arrow keys tilt; lands on its skids, kicks up downwash). The lights and indicators (`L`, `Q`/`E`, `O`) work on
  whatever you're riding (the helicopter has navigation lights, a strobe and a landing light), the MX-5 is left parked
  with its lights off, and the map follows the ride. Each has its own arcade handling and gauges; the
  roadster waits where you left it, and `1` brings it back to you.
- **Home** (`src/home.js`, ⌂ on the map, pause menu → Go home): a house on the Central road north of Fairfield. The
  garage door rolls up as you arrive; stop inside and press `F` to sleep until morning (fills the tank, saves). The
  trophy shelf in the garage gets a cup per achievement; the motorbike and Strada GT are parked on the drive.
- **Stats & trophies** (`src/stats.js`, pause menu): distances per vehicle, top speeds, airtime, jumps, crashes,
  money, licences and records, plus 26 achievements that unlock with a toast.
- **Photo mode extras**: `F` colour filters (black & white, sepia, vintage, vivid, cool, sunset), `V` tilt-shift
  depth of field with `Z`/`X` to move the focus line, `G` vignette, `L` an MX-5 Odyssey badge sticker on saved photos. Saved
  photos also go to the **Gallery** (pause menu, kept in this browser, last 24).
- **Atmosphere** (`src/ambience.js`): traffic headlights throw beams on the road after dark; street lights reflect as
  long warm streaks on wet roads at night; mist settles in the valleys, along the river and over the lakes at dawn
  and lingers after rain.
- **Traffic manners**: cars pull over and slow down for police cars in a pursuit, and for you with the hazards on
  (`O`); on the highway, trucks and buses keep to the slow lane and cars pull out to overtake them.
- **Wildlife** (`src/wildlife.js`): deer in the forests (out by the roads at dusk and dawn, bolting when you come
  close), cows grazing in the fields, seagulls over the harbour and coast, and flocks of small birds by the roads that
  burst into the air as you pass.
- **Wear, tear and roadside help** (`src/service.js`): rocks and gravel at speed (and hard knocks) can puncture a
  tyre: it loses grip, drags and pulls. A badly damaged engine drops into limp mode. Pause menu → *Roadside
  assistance*: a breakdown van comes to you, changes flats, patches the engine, straightens loose wheels and leaves
  10 L of fuel (paid by the job).
- **Styling** (`src/custom.js`, in the garages): body kit (front lip, side skirts, diffuser, ducktail), roll bar,
  hardtop, ride height, wheel width, racing stripes in six colours, front-wing roundels with your number, and MX-5
  Odyssey badges on the rear fenders. The decals are drawn by the paint shader, so they follow the body's curves.
- **Challenges** (`src/challenges.js`): rival MX-5s cruise the main roads: get close behind one and flash your
  lights (`L`) for a street race to a red beam ~1.5 km up the road. **Speed traps** on Highway 1 record your speed
  (⚡ on the map) against local records; your **longest jump** is recorded, with JUMP signs at the biggest crests.
  Pause menu → Jobs: a **boat race** round ten buoys in the bay off Port Ruby and an **air race** through twelve
  rings around Silverpine Peaks, with gold, silver and bronze times.
- **Police career** (`src/career.js`, pause menu → Jobs → Police patrol): take a patrol car out; dispatch sends you
  after speeders (catch up behind them, they pull over; stop beside them for the ticket) and getaway cars (ram them
  three times, then stop beside them to arrest). A red beam marks the suspect.
- **Swift Parcels**: a five-drop delivery route in the company van from the depot at your house; buy more vans
  ($8,000 each) and the business pays out about $45 a minute per van while you play.
- **Gull Island** (`src/island.js`): over a 500 m causeway bridge from the Coast road's western bend. A ring road
  circles low green hills with palms; wide sand beaches shelve into turquoise shallows all round, and a red-and-white
  lighthouse stands on the rocky headland to the south (its beam sweeps the sea at night). **Gull Bay**, the resort on
  the east beach, has a promenade (off the ring road, past the ferry pier) with a surf shop, a gelato kiosk, a café,
  souvenirs, a dive centre, a beach market and the Hotel Gull Bay (lit up at night); on the sand, parasols and
  loungers with sunbathers, the Gull Bay Beach Bar, a lifeguard tower, swimmers inside a buoy line, and offshore a
  banana boat and a parasail circling the bay. Activities (press `F`): **hire a jet ski** at the jetty ($20, `1`
  brings the MX-5 back) and **join the beach volleyball** game ($50 if you win).
- **Red Mesa Raceway, public side** (`src/raceway.js`): an entrance plaza at the end of the access road (welcome arch,
  ticket booths, a barrier that lifts as you arrive, flags); a passage through the pit building; and the **infield
  bridge** from the paddock up over the pit lane and the main straight (the circuit's name across it), down into the
  **raceway village**: a high street of team shops, cafés and hospitality, the Raceway Museum, the Paddock Hotel,
  food trucks, a big screen, bunting, street lamps and a campsite. The bridge deck is its own surface, so cars on the
  track pass underneath. **Track entries** (green signs, painted arrows) run from each end of the paddock onto
  the pit lane, which joins the circuit. The rest of the infield is filled: car parks, campsites, hospitality
  marquees, small spectator stands at the corners, and parkland with trees and benches.
- **Riding along** (`src/transport.js`), press `F` at the prompt: the stopping train carries a **Motorail** car-carrier
  wagon (wait at a station, load when it's in, drive off at any later station, $40); **Bayline Ferries** runs
  West Bay pier (Coast road) → **Gull Island** (a pier off the Gull Bay beach, at the end of the harbour road down
  from the ring road) → the west end of Port Ruby quay and back ($25 a leg); the **Silverpine cable car** carries your
  car from a station at the end of the ski car park to a levelled summit plateau at 535 m beside the chairlift's top
  station (two counterweighted cabins on parallel track ropes, towers placed where the ground rises, a railed
  viewpoint at the top; $30); and the **Freight
  driver** job (pause menu) puts you in the freight train's cab with your car on its carrier wagon: W power, S brake,
  signals go yellow/red near the train ahead, running a red trips the emergency brake. Stop on the mark to get paid.
  `C` switches between the cab and outside views.
- **Save**: your position, heading, time of day, fuel and engine state are saved every 10 s and restored on reload.
- **Pilou International Airport** (`src/airport.js`, paths in `src/airpath.js`): an 800 m runway (36/18) on a levelled
  plateau between Fairfield and Pinewood, reached by the airport road from Pinewood. Markings, edge/threshold/taxiway
  lights, approach lights with a running strobe, and a PAPI that reads *your* glideslope (two white, two red = on slope).
  Terminal with jet bridges and the Pilou logo, control tower with a rotating beacon, Pilou Air hangars, windsock and an
  entrance sign. Lights (edge, threshold, taxiway, approach, PAPI, beacon) have halos that keep a minimum size and ignore the fog, so the
  field reads at night and in fog; floodlights pool light on the apron. Two Pilou Air airliners fly the full circuit (hold short, line up, take off, right-hand circuit, final
  from the south, land, taxi back), waiting at the holding point while the runway is busy; two light aircraft fly
  sightseeing loops. Missions: *Fairfield → Pilou International* (drive) and *Pilou approach* (fly and land).
- **Garage** (pause menu): seven paints and five wheel finishes, saved.
- **Photo mode** (`0` or the pause menu): free camera, WASD/QE, drag to look, wheel zoom, `[ ]` time of day, Enter saves a PNG.

## Career: money, garages, jobs, races, police

- **Cash** (top right) starts at $2,500 and is saved. Missions pay (more under par); jobs and races pay too.
- **Garages** (orange G on the map: Fairfield, Port Ruby, Mesa, and the raceway pits): drive into the workshop and stop.
  Buy engine stages, a turbo, tyres, brakes, suspension, weight reduction and a nitrous kit (`Z`, or LB on a pad with the
  automatic box); pay for a full service; respray and change wheels for free.
- **Jobs** (pause menu): *passenger flights* from Pilou International gate 3 to Mesa Field (a desert airstrip) or the
  Port Ruby seaplane base (land on the water by the buoys), paid by distance, time and how softly you touch down;
  *taxi* fares; *pizza* deliveries from Luigi's in Fairfield; *towing* broken-down cars to the nearest garage.
- **Red Mesa Raceway** (south-east desert): a 1.46 km circuit with kerbs, Armco, grandstand, pit wall and a start gantry.
  Races are 3 laps against five AI drivers who follow the racing line at their own pace and pull out to pass; start
  lights, lap times, positions, prize money for the top six. **Time trial**: flying laps alone against your saved
  best-lap ghost (the highway lap mission has a ghost too).
- **Police**: speeding in town, running red lights, hitting pedestrians or ramming traffic raises a wanted level
  (1–3 stars). Patrol cars with light bars and sirens give chase; stop near one to pay a fine, or lose them by distance
  or by taking to the air or the water.
- **City life**: pedestrians walk the pavements (and dive out of your way), traffic lights at the main-road junctions
  (AI traffic stops for them), cars parked along the kerbs, buses in the traffic.
- **Instruments**: in the plane, an attitude indicator, altimeter (with radio altitude), HSI and vertical speed, with
  ILS localizer/glideslope for runway 36. In the mech, a holographic HUD with heading tape, jets and leg status, and
  target boxes on anything within punching range.
- **Wider world**: a railway loop with four stations and a passenger train; Port Ruby harbour with cranes, containers,
  a moored freighter and ships offshore; the Silverpine Peaks chairlift and the car cable car up to a 535 m summit off the mountain pass.

## Files

- `src/world.js` – heightfield, biomes, river/lakes, roads, bridges, ground queries, waves
- `src/scenery.js` – terrain meshes, road/bridge meshes, water shader, sky/sun/moon/stars, vegetation, clouds
- `src/car.js` – procedural MX-5 NA model: lofted body with shut lines, open cockpit (seats, dash with round vents and gauges, 4-spoke wheel), pop-up headlights, oval tail lamps, 14" daisy alloys; boat hull + outboard, wings + tail + prop
- `src/physics.js` – vehicle dynamics
- `src/traffic.js` – AI traffic: hatchbacks, saloons, SUVs, vans and box trucks (extruded bodies with glass, bumpers, lamps and rimmed wheels, built in `createTrafficCar` in `src/car.js`)
- `src/audio.js` – engine modelled from firing pulses through an exhaust resonator bank (AudioWorklet, ScriptProcessor fallback), plus tyre, road, gravel, wind, water noise; one master gain for mute
- `src/main.js` – game loop, input, camera, HUD, minimap
- `src/events.js` – weekly board, hitchhikers, seasonal sets, neon races, drive-in, postcards
- `src/mirror.js` – rear-view mirror · `src/weapons.js` – mech shells, missiles and laser · `src/gps.js` – navigation

## Ideas for next steps

More traffic types, pedestrians, LOD terrain streaming for a larger map,
GPU-instanced grass, saving the player's position.
