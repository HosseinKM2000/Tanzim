# Canonical Taxonomy — 24-Sector Coverage Audit

Status: **reviewable QA proposal — not publicly activated**
Dataset: `backend/app/reference_data/tanzim_sector_categories_v2_proposed_qa.json`
Version: `scb-2026-11-20-v2-proposed-qa`
Official baseline: `scb-2026-11-14-v1` (unchanged)
Date: 2026-11-22

This audit describes **what the proposed parent-category bank contains**. It does not claim a
statistical coverage percentage. No representative product sample, sales catalogue, or shop
inventory was measured, so any percentage would be invented. The evidence is the category list
itself: 24 sectors, 362 parent categories, 1,122 example products, and a per-sector review of
families, gaps, ambiguity, and overlap.

## 1. Method and limits

1. Enumerated every sector and parent category in the v2 dataset and compared each code with v1.
2. Checked that every v1 sector, category code, name, and approval status is preserved.
3. Counted the families represented by the parent titles and grouped them by retail function.
4. Recorded families that have **no dedicated parent** in that sector. These are review
   candidates, not automatic additions; a family may deliberately belong to another sector.
5. Recorded ambiguous titles and cross-sector overlaps using category names and examples.
6. Marked the approval state. Only sector 01 (automotive) is approved; the other 23 sectors
   remain proposed and require product-owner sign-off.
7. Did not use custom-category usage, missing-data counts, or assumed assortment sizes as
   coverage evidence.

Important schema limits of the current model:

- The taxonomy is **parent-only** (`classification_level: parent_only`). There is no second
  level and no parent-child relation in the shipped model.
- Categories carry `examples_fa` as short usage guidance; the dataset has no separate
  `description_fa` field.
- `examples_fa` are illustrative, **not inventory**. `unknown_approval_denies: true` and
  `examples_are_inventory: false` are enforced in the runtime contract.
- One database cannot mix v1 and v2 because sector/category identity is unique per version.
  QA therefore uses a disposable database and the explicit QA gate.

## 2. Code and barcode compatibility

| Check | Result | Evidence |
|---|---|---|
| Sector codes 01–24 unchanged | PASS | v2 sector codes are exactly `01`–`24`; names match v1 |
| Existing category codes unchanged | PASS | v2 keeps every v1 `(sector, code)` pair |
| Existing category names unchanged | PASS | `test_v2_preserves_every_v1_code_and_name` |
| No code reuse / renumbering | PASS | new codes start after the highest v1 code in each sector |
| Highest code per sector | 25 (sector 01) | all others ≤ 22 |
| Remaining code capacity | at least 74 per sector | hard cap 99; minimum remaining = 74 |
| `TZ1` barcode contract | unchanged | no barcode-generation code or format change |
| Manual barcode lifecycle | unchanged | external reservation and retirement flow retained |
| Invoice/history snapshots | unchanged | no rewrite or regeneration |

The existing `sector * 100 + code` identity scheme is compatible with this proposal. The bank
does **not** need a barcode-contract change, a code-length change, or a renumbering step.

## 3. Aggregate table

`v1` is the number of categories in the official baseline. `new` is the number added in v2.
`capacity` is `99 - highest used code`.

| Sector | Title | v1 | Total | New | Approved | Proposed | Capacity |
|---|---|---|---|---|---|---|---|
| 01 | قطعات، لوازم و تجهیزات خودرو | 25 | 25 | 0 | 25 | 0 | 74 |
| 02 | ابزارآلات و تجهیزات صنعتی | 12 | 22 | 10 | 0 | 22 | 77 |
| 03 | برق، روشنایی و تجهیزات الکتریکی | 12 | 15 | 3 | 0 | 15 | 84 |
| 04 | تأسیسات و تجهیزات ساختمانی | 12 | 16 | 4 | 0 | 16 | 83 |
| 05 | یراق‌آلات، پیچ و اتصالات | 11 | 13 | 2 | 0 | 13 | 86 |
| 06 | مصالح و ملزومات ساختمانی | 12 | 15 | 3 | 0 | 15 | 84 |
| 07 | موبایل و لوازم جانبی | 10 | 17 | 7 | 0 | 17 | 82 |
| 08 | کامپیوتر و تجهیزات شبکه | 12 | 16 | 4 | 0 | 16 | 83 |
| 09 | لوازم الکترونیکی و دیجیتال | 11 | 14 | 3 | 0 | 14 | 85 |
| 10 | لوازم خانگی و قطعات | 12 | 14 | 2 | 0 | 14 | 85 |
| 11 | پوشاک، کیف، کفش و محصولات چرمی | 12 | 15 | 3 | 0 | 15 | 84 |
| 12 | پارچه، خرازی و ملزومات دوخت | 11 | 14 | 3 | 0 | 14 | 85 |
| 13 | آرایشی، بهداشتی و مراقبتی | 12 | 15 | 3 | 0 | 15 | 84 |
| 14 | مواد غذایی و محصولات سوپرمارکتی | 14 | 17 | 3 | 0 | 17 | 82 |
| 15 | لوازم تحریر، کتاب و ملزومات اداری | 10 | 13 | 3 | 0 | 13 | 86 |
| 16 | لوازم منزل، دکوراسیون و آشپزخانه | 12 | 14 | 2 | 0 | 14 | 85 |
| 17 | مبلمان و صنایع چوبی | 11 | 13 | 2 | 0 | 13 | 86 |
| 18 | ورزش، بدنسازی و تجهیزات تفریحی | 12 | 16 | 4 | 0 | 16 | 83 |
| 19 | اسباب‌بازی، کودک و سرگرمی | 12 | 15 | 3 | 0 | 15 | 84 |
| 20 | کشاورزی، باغبانی و دامپروری | 12 | 14 | 2 | 0 | 14 | 85 |
| 21 | تجهیزات پزشکی و آزمایشگاهی | 11 | 13 | 2 | 0 | 13 | 86 |
| 22 | طلا، زیورآلات و اکسسوری | 10 | 13 | 3 | 0 | 13 | 86 |
| 23 | قطعات و تجهیزات ماشین‌آلات | 12 | 15 | 3 | 0 | 15 | 84 |
| 24 | سایر کالاها و کسب‌وکارها | 1 | 8 | 7 | 0 | 8 | 91 |
| **Total** | | **281** | **362** | **81** | **25** | **337** | |

## 4. Per-sector audit

The sections below use four labels:

- **Represented families** — parent titles that exist in the proposed bank.
- **No dedicated parent** — a retail family not represented by a dedicated title. It may be
  intentional; confirm ownership before adding a code.
- **Ambiguity / overlap** — titles whose boundary is unclear or which duplicate another title.
- **Review status** — approval state and the owner decision still needed.

### 01 — قطعات، لوازم و تجهیزات خودرو (25 categories, approved)

- **Represented families:** engine internals; belts/chains; fuel and air intake; exhaust and
  emissions; engine cooling; gearbox and drivetrain; clutch; suspension and front-end; steering
  and hydraulics; brakes; electrical/electronics; sensors and ECUs; lighting; body and chassis;
  glass/mirrors/wipers; cabin and interior; air conditioning/heating/ventilation; wheels, rims
  and tyres; fasteners; clips and retainers; seals and gaskets; oils/fluids/consumables; filters
  and service items; luxury/accessory/decoration; repair tools and garage equipment.
- **No dedicated parent:** EV high-voltage battery/charging components, motorcycle/scooter
  parts, car-care/detailing chemicals, body paint and collision-repair materials. These are not
  separate codes today. Sector 01 is an approved contract, so none may be added without an
  explicit product-owner decision and a new approved version.
- **Ambiguity / overlap:** `برق و الکترونیک` vs `سنسورها و یونیت‌ها`; `پیچ، مهره و اتصالات` vs
  `خار، بست و خارجات`; `لوازم لوکس، جانبی و تزئیناتی` is broad and can absorb unrelated items.
- **Boundary examples:** `شارژر خودرو برقی` is in sector 03, `دوربین داشبورد` in sector 07,
  and `روغن صنعتی` in sector 23. Vehicle-specific parts must stay in 01; industrial rotating
  equipment belongs in 23.
- **Review status:** approved in v1. Frozen; do not modify code, name, or status.

### 02 — ابزارآلات و تجهیزات صنعتی (22 categories, proposed)

- **Represented families:** hand tools; power tools; cordless tools; pneumatic tools; measuring
  and precision tools; cutting/grinding/drilling; welding and cutting; workshop equipment;
  lifting and transfer; safety equipment; tool parts and batteries; industrial consumables;
  woodworking; plumbing installation; garden tools; heavy industrial power tools; compressors
  and compressed air; pumps and workshop fluids; painting/spraying; test and diagnosis; small
  workshop machines; industrial cleaning equipment.
- **No dedicated parent:** hydraulic torque/pipe tools as a distinct family, machining tools
  (lathe/mill tooling), fasteners and anchors (sector 05), and scaffolding. Confirm whether a
  tool retailer needs separate parents or whether existing broad titles are enough.
- **Ambiguity / overlap:** `ابزار بادی و پنوماتیک` uses `کمپرسور` as an example while
  `کمپرسور و هوای فشرده` is its own parent; `ابزار و تجهیزات کارگاهی` contains press/jack while
  `ماشین‌آلات کوچک کارگاهی` also contains press; `تجهیزات انتقال` overlaps sector 23 lifting;
  `تجهیزات ایمنی` overlaps sector 24.
- **Boundary examples:** garden tools vs sector 20, welding equipment vs sector 23, cleaning
  equipment vs sector 24, measuring tools vs sector 03.
- **Review status:** proposed. Needs product-owner approval for the 10 new titles.

### 03 — برق، روشنایی و تجهیزات الکتریکی (15 categories, proposed)

- **Represented families:** wires and cables; switches/sockets/installation; lamps and light
  sources; light fixtures; distribution panels; protection and control; wiring accessories;
  conduit/trunking/cable tray; industrial electrical equipment; power supplies and batteries;
  electrical measurement; emergency power and solar; transformers/ballasts/drivers; smart
  lighting; EV charging equipment.
- **No dedicated parent:** electric motors (sector 23), whole-home automation hubs
  (sector 09), and cable joints/terminations as a distinct family. Confirm whether these are
  missing or intentionally assigned to other sectors.
- **Ambiguity / overlap:** `ترانس` appears in `منابع تغذیه و باتری` and again in
  `ترانس، بالاست و درایور`; `مولتی‌متر` appears here and in sector 02; industrial electrical
  equipment overlaps sector 23; smart lighting overlaps sector 09 smart devices.
- **Boundary examples:** domestic wiring and fixtures → 03; machine-integrated electrical
  components → 23; home appliances → 10.
- **Review status:** proposed. The two overlapping `ترانس` titles should be resolved before
  approval.

### 04 — تأسیسات و تجهیزات ساختمانی (16 categories, proposed)

- **Represented families:** pipes and fittings; valves and flow control; water pumps and
  pressure systems; heating; cooling; ventilation and ducts; sanitary building equipment;
  water filtration; installation tools; insulation and waterproofing; building automation;
  spare parts; gas equipment; landscape irrigation; fire protection; pools and Jacuzzis.
- **No dedicated parent:** elevators/escalators, sewage/drainage treatment, solar water heaters,
  central vacuum systems, and snow/ice melting. Confirm whether these are in scope for the
  sector’s target shops.
- **Ambiguity / overlap:** `تجهیزات سرمایشی` includes `کولر` while sector 10 has a home cooling
  title; `تصفیه و فیلتراسیون آب` overlaps sector 10 water purification; `ابزار و ملزومات نصب`
  overlaps sector 02; spare parts overlap sector 23.
- **Boundary examples:** installed building equipment → 04; construction materials → 06;
  fasteners and fittings → 05; pool play equipment → 18/19.
- **Review status:** proposed. Elevator and drainage ownership needs a human decision.

### 05 — یراق‌آلات، پیچ و اتصالات (13 categories, proposed)

- **Represented families:** screws; nuts; washers and metal connections; rivets/pins/nails;
  anchors and mounting; clamps and retainers; door/window hardware; cabinet/furniture hardware;
  chains/wire rope and hooks; adhesives/sealants; specialized structural connections; locks and
  security; pipe/hose fittings.
- **No dedicated parent:** springs, retaining rings as a separate family, and threaded rods.
  Some are covered by washers/anchors; confirm before adding codes.
- **Ambiguity / overlap:** `یراق درب و پنجره` includes `قفل`, and `قفل و سیستم امنیتی` is a
  separate title; `چسب، آب‌بند و اتصال شیمیایی` overlaps sector 02 and 06; `اتصالات لوله‌ای و
  شیلنگ` overlaps sector 04; `قطعات اتصال تخصصی` overlaps sector 23.
- **Boundary examples:** furniture fittings → 05; finished furniture → 17; pipe/system
  installation → 04; industrial machine fasteners → 23.
- **Review status:** proposed. Lock duplication should be resolved first.

### 06 — مصالح و ملزومات ساختمانی (15 categories, proposed)

- **Represented families:** cement/plaster/powders; brick/block/wall materials; steel sections;
  tile/ceramic/stone; paint and coatings; moisture/thermal insulation; adhesives/grout/additives;
  doors/windows/profiles; floor and wall coverings; ceilings; installation materials; decorative
  materials; building stone; prefabricated components; traditional/local materials.
- **No dedicated parent:** sand/gravel/aggregates, glass panes, timber/lumber, and gypsum boards.
  Confirm whether these belong here, in sector 17 (wood), or in a future approved family.
- **Ambiguity / overlap:** `کاشی، سرامیک و سنگ` and `سنگ ساختمانی` overlap; `رنگ و پوشش` overlaps
  sector 02 painting equipment; `چسب، ملات و افزودنی` overlaps sector 05; `سقف و پوشش‌ها`
  overlaps prefabricated components; `درب، پنجره و پروفیل` overlaps finished doors/windows.
- **Boundary examples:** raw materials → 06; installed building systems → 04; finished
  furniture → 17; decorative objects → 16.
- **Review status:** proposed. Stone and ceiling overlaps need explicit definitions.

### 07 — موبایل و لوازم جانبی (17 categories, proposed)

- **Represented families:** phones; tablets/e-readers; cases and bumpers; screen/lens
  protectors; chargers; cables/adapters; batteries/power banks; audio/headphones; repair parts;
  repair tools; wearables; tablet accessories; modems/mobile internet; security/tracking;
  car-mobile accessories; mobile gaming; digital bags/backpacks.
- **No dedicated parent:** drones, mobile POS/accessory kits, and smart-home hubs. Drones may
  belong to sector 09; confirm with the product owner.
- **Ambiguity / overlap:** wearables overlap sector 09 smart devices; mobile gaming overlaps
  sectors 08 and 09; digital bags overlap sector 11 and 15; mobile modem overlaps sector 08
  networking; car holders/dashcams overlap sector 01 accessories.
- **Boundary examples:** phone-centric accessory → 07; computer peripheral → 08; television,
  camera, console, or general electronics → 09.
- **Review status:** proposed. The 7 new codes 07-11..07-17 are a coherent extension, but the
  gaming/bag ownership must be agreed.

### 08 — کامپیوتر و تجهیزات شبکه (16 categories, proposed)

- **Represented families:** desktops; laptops; CPU/motherboard; RAM/storage; graphics and
  internal parts; monitors; peripherals; networking; network cabling; servers/racks; UPS and
  cooling; repair parts/tools; printers/consumables; gaming; microphones/streaming; mounts and
  ergonomics.
- **No dedicated parent:** software/licenses, projectors, 3D printers, and barcode/POS hardware.
  Confirm whether these are out of scope or belong in 08/09/15.
- **Ambiguity / overlap:** peripherals vs gaming peripherals; printers/consumables overlap
  sector 15 office equipment; UPS overlaps sector 03; ergonomics overlaps sector 17 office
  furniture; gaming overlaps sectors 07 and 09.
- **Boundary examples:** computer/network hardware → 08; TV/audio/camera/console → 09; office
  stationery and paper → 15; office chair → 17.
- **Review status:** proposed. Projector and POS ownership should be decided before approval.

### 09 — لوازم الکترونیکی و دیجیتال (14 categories, proposed)

- **Represented families:** televisions/displays; audio; cameras/lenses; surveillance; smart
  devices; consoles/gaming; communications; cables/adapters; electronic components; batteries and
  power supplies; electronics tools; cases/protection; mounts/installation; VR equipment.
- **No dedicated parent:** drones, GPS navigation, projectors, and home-theatre packages.
  Projectors could be a display subtype; drones could be cameras or a new family.
- **Ambiguity / overlap:** smart devices overlap wearables (07) and smart lighting (03);
  consoles overlap gaming in 07/08; batteries overlap 03/07; cases overlap 07; mounts overlap
  08; `تجهیزات ارتباطی` is very broad.
- **Boundary examples:** phone/tablet → 07; computer/network → 08; television, camera, audio,
  console, surveillance → 09.
- **Review status:** proposed. Drone/projector scope needs product-owner confirmation.

### 10 — لوازم خانگی و قطعات (14 categories, proposed)

- **Represented families:** refrigerators/freezers; washers/dryers; dishwashers; cooking
  appliances; small kitchen appliances; home cleaning; home cooling/heating; air/water
  purification; mechanical parts; electrical parts; hoses/installation; consumables/maintenance;
  non-electric kitchenware; personal-care appliances.
- **No dedicated parent:** water heaters, range hoods as a separate title, sewing machines, and
  mattresses. Some are covered by heating/cooking or other sectors; confirm.
- **Ambiguity / overlap:** small kitchen appliances vs housewares (16); home cooling/heating vs
  building HVAC (04); water purification vs 04; non-electric kitchenware vs 16; personal-care
  appliances vs 13 beauty tools.
- **Boundary examples:** powered home appliance → 10; non-powered pot/pan/plate → 16; installed
  building HVAC → 04.
- **Review status:** proposed. The kitchenware/appliance boundary needs a rule.

### 11 — پوشاک، کیف، کفش و محصولات چرمی (15 categories, proposed)

- **Represented families:** women’s clothing; men’s clothing; children’s clothing; underwear and
  loungewear; sportswear; women’s shoes; men’s shoes; children’s shoes; women’s bags; men’s bags;
  leather goods/accessories; fashion accessories; workwear/safety; traditional clothing;
  maternity/nursing clothing.
- **No dedicated parent:** swimwear, school uniforms, plus-size lines, and religious clothing.
  These may be subtypes of existing apparel parents; confirm rather than adding by default.
- **Ambiguity / overlap:** sportswear overlaps sector 18; bags overlap 07 and 15; leather overlaps
  sector 12 raw materials; fashion accessories overlap sector 22; workwear/safety overlaps 02
  and 24; maternity overlaps 19/21.
- **Boundary examples:** finished garment → 11; fabric/leather raw material → 12; sports
  equipment → 18; fashion jewelry → 22.
- **Review status:** proposed. A clear finished-garment vs material rule is required.

### 12 — پارچه، خرازی و ملزومات دوخت (14 categories, proposed)

- **Represented families:** apparel fabric; upholstery/decor fabric; leather and leather
  substitutes; thread/yarn; buttons/zips/fasteners; ribbons/elastic/trim; lining/interlining;
  needles and sewing tools; embroidery/knitting; sewing-machine equipment; garment packaging and
  labels; bag/shoe fabric; patterns and sewing education; pressing mats/pads.
- **No dedicated parent:** dyes/pigments, quilting supplies, and industrial/technical textiles.
  Confirm whether these are needed by the target retailers.
- **Ambiguity / overlap:** upholstery fabric overlaps furniture materials (17); leather overlaps
  finished leather goods (11); packaging/labels overlap 24; patterns overlap books (15).
- **Boundary examples:** fabric/trim/notion → 12; finished clothing/bag/shoe → 11; finished
  furniture → 17.
- **Review status:** proposed. Dye and technical-textile scope is a human decision.

### 13 — آرایشی، بهداشتی و مراقبتی (15 categories, proposed)

- **Represented families:** face makeup; eye makeup; lip makeup; skincare; cleansers; hair care;
  hair colour/salon products; perfume/fragrance; personal hygiene; beauty tools; nails and nail
  extensions; shaving/grooming; baby/mother products; men’s products; travel hygiene.
- **No dedicated parent:** sunscreen as a separate family, professional salon furniture, and
  cosmetic devices. Sunscreen is likely skincare; confirm. Supplements belong to 14-16.
- **Ambiguity / overlap:** personal hygiene overlaps oral care (21); beauty tools overlap
  personal-care appliances (10); shaving overlaps men’s products; baby products overlap 19/21;
  travel hygiene overlaps 24.
- **Boundary examples:** cosmetic/personal-care product → 13; medical device/oral clinical
  product → 21; household cleaning → 14/16/24.
- **Review status:** proposed. Men’s products vs shaving is the clearest duplication.

### 14 — مواد غذایی و محصولات سوپرمارکتی (17 categories, proposed)

- **Represented families:** rice/grains/legumes; oils and cooking ingredients; canned/ready food;
  dairy; meat/protein products; frozen products; beverages; tea/coffee/herbal drinks;
  sweets/chocolate/snacks; bread/cake/pasta; spices/condiments/sauces; nuts/dried fruit;
  household cleaning; paper/disposables; baby food; diet/organic; breakfast products.
- **No dedicated parent:** **fresh fruit and vegetables**, **eggs**, **fresh bakery**, and
  **deli/prepared foods**. This is the most material gap found in the audit. A supermarket can
  sell these every day, and they do not have a natural dedicated parent today. `گوشت و
  فرآورده‌های پروتئینی` may absorb eggs/fish only if its definition is widened.
- **Ambiguity / overlap:** household cleaning and disposables overlap 16/24; baby food overlaps
  13/21; diet/organic overlaps supplements; breakfast overlaps sweets/bread/nuts; protein is
  broad enough to hide fresh meat, fish, and eggs.
- **Boundary examples:** fresh produce → currently no dedicated parent; packaged snack → 14-09;
  household detergent → 14-13 or 16/24; baby bottle → 19/21.
- **Review status:** proposed. Recommend a product-owner decision on adding produce, eggs,
  fresh bakery, and deli before calling this sector comprehensive.

### 15 — لوازم تحریر، کتاب و ملزومات اداری (13 categories, proposed)

- **Represented families:** writing instruments; notebooks/paper; filing and document
  organisation; books/educational resources; art supplies; engineering/drawing tools; desk
  supplies; office equipment; printing consumables; gifts/packaging; school bags; stamps;
  whiteboards.
- **No dedicated parent:** calendars/planners as a distinct family, office furniture, school
  uniforms, and educational toys. These may belong to 16/17/11/19; confirm.
- **Ambiguity / overlap:** books overlap children’s educational products (19); printers and
  consumables overlap 08; gifts overlap 24; school bags overlap 11/07; office equipment is broad.
- **Boundary examples:** paper/stationery → 15; printer hardware → 08; office chair → 17;
  children’s book/toy → 19.
- **Review status:** proposed. Printer/consumable ownership must be agreed.

### 16 — لوازم منزل، دکوراسیون و آشپزخانه (14 categories, proposed)

- **Represented families:** cookware; serving ware; kitchen tools; organisers/storage; bedding;
  home textiles; curtains/window coverings; decorative lighting; décor; clocks/mirrors; bathroom
  accessories; cleaning tools; disposable tableware; indoor plants.
- **No dedicated parent:** carpets/rugs, mattresses, wall art, and laundry storage. Confirm
  whether these are needed or belong to 17.
- **Ambiguity / overlap:** cookware/serving/kitchen tools overlap 10 non-electric kitchenware;
  decorative lighting overlaps 03; cleaning tools overlap 14/24; disposables overlap 14;
  indoor plants overlap 20.
- **Boundary examples:** non-powered home good → 16; powered appliance → 10; furniture → 17;
  plant/seed/fertiliser → 20.
- **Review status:** proposed. Rug/mattress ownership is the main open question.

### 17 — مبلمان و صنایع چوبی (13 categories, proposed)

- **Represented families:** living-room furniture; classic/formal furniture; dining tables and
  chairs; office furniture; bedroom sets; wardrobes/shelves; cabinets and wooden fittings;
  decorative tables; small wooden products; furniture hardware; raw materials; outdoor
  furniture; children’s furniture.
- **No dedicated parent:** mattresses, rugs, curtains, and lighting. These are likely 16, but
  the boundary should be stated.
- **Ambiguity / overlap:** office furniture overlaps 08 ergonomics; fittings overlap 05; raw
  materials overlap 06/12; outdoor furniture overlaps 18/19; children’s furniture overlaps 19.
- **Boundary examples:** finished furniture → 17; furniture fitting → 05; wood raw material →
  17-11 or 06; decorative object → 16.
- **Review status:** proposed. Furniture vs fitting and furniture vs décor rules are required.

### 18 — ورزش، بدنسازی و تجهیزات تفریحی (16 categories, proposed)

- **Represented families:** gym equipment; weights/strength; bodyweight training; cardio;
  martial arts; ball sports; sportswear/shoes; hiking/camping; cycling; swimming/water sports;
  recovery/corrective training; accessories/parts; winter/ski; fishing; shooting/archery;
  equestrian.
- **No dedicated parent:** yoga mats as a distinct family, team uniforms, sports supplements,
  and bicycle spare parts as a separate family. Some are covered by apparel/recovery/cycling.
- **Ambiguity / overlap:** sportswear overlaps 11; cycling parts overlap 02/23; swimming
  overlaps 19 water play; winter clothing overlaps 11; fishing overlaps 20 aquaculture;
  equestrian overlaps 20 livestock equipment.
- **Boundary examples:** sports equipment → 18; general clothing → 11; toy water play → 19;
  agricultural fish farming → 20.
- **Review status:** proposed. Team uniform and supplement scope need approval.

### 19 — اسباب‌بازی، کودک و سرگرمی (15 categories, proposed)

- **Represented families:** infant toys; toddler toys; dolls/figures; toy cars/ride-ons; board
  and card games; construction/educational; children’s art; outdoor play; baby gear; child
  transport; child room accessories; entertainment/gifts; water play; children’s books/education;
  party/birthday supplies.
- **No dedicated parent:** costumes, video games, and baby monitors. Video games belong to
  08/09; costumes may be seasonal party goods; confirm.
- **Ambiguity / overlap:** baby gear overlaps 13/21; room accessories overlap 17/16;
  entertainment/gifts overlap 24; water play overlaps 18; books overlap 15; party supplies
  overlap 24.
- **Boundary examples:** toy/play item → 19; clothing → 11; baby medical product → 21; party
  consumable → 19-15 or 24-07.
- **Review status:** proposed. Costume and video-game ownership should be explicit.

### 20 — کشاورزی، باغبانی و دامپروری (14 categories, proposed)

- **Represented families:** seeds/seedlings; fertiliser/plant nutrition; pesticides/pest control;
  garden tools; irrigation; farm machinery; farm-machine parts; greenhouse equipment; soil/
  growing media; livestock/poultry equipment; animal feed/supplements; storage/packaging;
  beekeeping; aquaculture.
- **No dedicated parent:** veterinary medicines, milking equipment, and fishing gear (18).
  Veterinary medicine is a regulated family and needs a deliberate decision.
- **Ambiguity / overlap:** garden tools overlap 02; irrigation overlaps 04; machinery and parts
  overlap 23; packaging overlaps 24; aquaculture overlaps 18 fishing.
- **Boundary examples:** agricultural input/machinery → 20; hand/power tool → 02; installed
  landscape irrigation → 04; recreational fishing → 18.
- **Review status:** proposed. Veterinary scope requires human/regulatory review.

### 21 — تجهیزات پزشکی و آزمایشگاهی (13 categories, proposed)

- **Represented families:** examination/diagnosis; hospital equipment; mobility aids; medical
  consumables; wound care; laboratory equipment; lab glassware/containers; lab reagents/kits;
  dental equipment; disinfection/sterilisation; parts/accessories; pregnancy/newborn; oral
  hygiene.
- **No dedicated parent:** imaging (X-ray/ultrasound), surgical instruments, orthotics/
  prosthetics, and veterinary equipment. These may be outside a retail shop’s scope; confirm.
- **Ambiguity / overlap:** medical consumables overlap PPE (24); disinfection overlaps household/
  personal hygiene; pregnancy/newborn overlaps 13/19; oral hygiene overlaps 13 personal hygiene.
- **Boundary examples:** clinical/medical product → 21; cosmetic/personal-care product → 13;
  general PPE → 24; baby toy → 19.
- **Review status:** proposed. Imaging and surgical scope needs a regulatory/assortment decision.

### 22 — طلا، زیورآلات و اکسسوری (13 categories, proposed)

- **Represented families:** rings; necklaces/chains; bracelets/bangles; earrings; sets; pendants/
  charms; watches/watch accessories; stones/materials; hair jewellery; boxes/storage; silver and
  costume jewellery; customisation/repair; men’s accessories.
- **No dedicated parent:** religious jewellery, children’s jewellery, and pearls as a distinct
  family. Confirm whether these are meaningful for the target shops.
- **Ambiguity / overlap:** watches overlap smartwatches (07); stones/materials overlap silver/
  costume; hair jewellery overlaps 11; boxes overlap 16; customisation/repair is a service, not
  a product; men’s accessories overlap 11.
- **Boundary examples:** fine/costume jewellery → 22; fashion scarf/belt → 11; smartwatch → 07;
  decorative box → 16 unless sold as jewellery packaging.
- **Review status:** proposed. The service category `سفارشی و تعمیر` needs a rule because it is
  not inventory.

### 23 — قطعات و تجهیزات ماشین‌آلات (15 categories, proposed)

- **Represented families:** industrial motors; gearboxes/power transmission; bearings; hydraulic
  systems; pneumatic systems; pumps/fluid transfer; automation/control; sensors/instruments;
  electrical/power equipment; mechanical machine parts; seals/fittings; maintenance tools;
  lubricants/industrial consumables; welding equipment; lifting/conveying.
- **No dedicated parent:** CNC machine tools, robotics, industrial boilers, and packaging
  machinery. These are large capital goods; confirm whether the sector serves their parts only.
- **Ambiguity / overlap:** motors/gearboxes/bearings/electrical overlap sector 01 vehicle parts;
  hydraulic/pneumatic/pumps/tools overlap sector 02; automation overlaps 03 industrial
  electrical; sensors overlap 03 measurement; lubricants overlap 01; welding overlaps 02;
  lifting overlaps 02.
- **Boundary examples:** machine-integrated industrial part → 23; vehicle part → 01; hand/power
  tool → 02; building electrical component → 03.
- **Review status:** proposed. The 01/02/23 boundaries are the most important approval item.

### 24 — سایر کالاها و کسب‌وکارها (8 categories, proposed)

- **Represented families:** uncategorised goods; packaging/shipping; public cleaning/hygiene;
  personal protective equipment; general consumables; gifts/souvenirs; occasion supplies;
  charity/aid packages.
- **No dedicated parent:** intentionally a catch-all. It should not become a substitute for a
  missing sector family; the audit recommends using it only when no specific parent fits.
- **Ambiguity / overlap:** packaging overlaps 12/20; cleaning overlaps 14/16/21; PPE overlaps
  02/11/21; general consumables overlaps many sectors; gifts overlap 15; occasion supplies
  overlap 19; aid packages overlap 14.
- **Boundary examples:** generic packaging → 24; garment label/packaging → 12; agricultural
  harvest crate → 20; party balloons → 19-15 or 24-07.
- **Review status:** proposed. Keep the catch-all definition explicit in the UI.

## 5. Cross-sector ownership rules proposed for review

These rules are recommendations for the product owner. They are not runtime authorization and
they do not change any category status.

| Overlapping area | Primary sector | Rule |
|---|---|---|
| Vehicle vs industrial rotating equipment | 01 vs 23 | Vehicle-specific part → 01; machine/plant part → 23 |
| Hand/power tools vs garden/agri tools | 02 vs 20 | General tool → 02; agricultural input/machinery → 20 |
| Building installation vs materials vs fittings | 04 vs 06 vs 05 | Installed system → 04; raw material → 06; fastener/fitting → 05 |
| Electrical component vs machine electrical | 03 vs 23 | Standalone electrical product → 03; machine-integrated part → 23 |
| Mobile vs computer vs electronics | 07 vs 08 vs 09 | Phone/tablet accessory → 07; computer/network → 08; AV/camera/console → 09 |
| Powered appliance vs houseware | 10 vs 16 | Powered appliance → 10; non-powered home good → 16 |
| General apparel vs sportswear | 11 vs 18 | Everyday fashion → 11; sport-specific performance item → 18 |
| Fabric/leather vs finished goods | 12 vs 11 | Raw material/notion → 12; finished garment/bag/shoe → 11 |
| Cosmetics/personal care vs medical/oral | 13 vs 21 | Cosmetic/personal care → 13; clinical/medical/oral product → 21 |
| Food vs household consumables | 14 vs 16/24 | Edible product → 14; cleaning/paper/disposable → 16 or 24 |
| Stationery vs IT hardware | 15 vs 08 | Paper/pen/office consumable → 15; printer/computer/network → 08 |
| Furniture vs fittings/materials | 17 vs 05/06/12 | Finished furniture → 17; fitting/material → 05/06/12 |
| Sports vs toys/water play | 18 vs 19 | Performance/sports equipment → 18; play/toy → 19 |
| Agriculture vs garden tools | 20 vs 02 | Farm input/machinery → 20; hand/power tool → 02 |
| Medical vs general hygiene | 21 vs 13/24 | Clinical product → 21; cosmetic/personal → 13; general PPE/cleaning → 24 |
| Fine jewellery vs fashion accessory | 22 vs 11 | Jewellery/watch → 22; scarf/belt/bag → 11 |
| Catch-all | 24 | Use only when no specific sector parent fits |

## 6. Priority findings for product-owner review

1. **Food (sector 14): fresh produce and eggs.** The bank has no dedicated fresh fruit/
   vegetable parent, and protein does not explicitly cover eggs/fish. This is a real retail gap,
   not a cosmetic naming issue.
2. **Food (sector 14): fresh bakery and deli.** Packaged bread/cake exists, but fresh bakery and
   prepared deli food are not separate families.
3. **Automotive (sector 01): EV and motorcycle scope.** The approved automotive contract is
   frozen. New EV high-voltage, charging, motorcycle, and body-paint families would require a
   new approved version; they were not added here.
4. **01/02/23 boundary.** Engine, gearbox, bearing, hydraulic, electrical, lubricant, welding,
   and lifting families appear in more than one sector. The ownership table above is the proposed
   resolution.
5. **07/08/09 boundary.** Wearables, gaming, bags, modems, cameras, and consoles overlap. The
   current split is phone → 07, computer/network → 08, AV/camera/console → 09.
6. **10/16 boundary.** Powered appliances vs non-powered kitchenware/housewares needs a visible
   rule in the category picker.
7. **13/21 boundary.** Oral hygiene, baby care, PPE, and disinfection appear in both personal-care
   and medical contexts.
8. **11/12/22 boundary.** Finished apparel vs fabric/leather vs fashion jewellery is currently
   clear in the titles but needs a UI rule to avoid user error.
9. **04/06/05 boundary.** Building installation vs materials vs fasteners is the second-most
   common source of duplicate-looking categories.
10. **24 catch-all.** It must not hide missing families. The UI should explain when to use it.

## 7. Approval status and what remains blocked

- Sector 01: 25/25 approved; frozen by the existing automotive contract.
- Sectors 02–24: 337 categories proposed; none is publicly activated.
- The 81 new categories are listed with examples in
  `docs/taxonomy/TAXONOMY_APPROVAL_MANIFEST.md`.
- The QA-only v2 dataset is active only through `ENVIRONMENT=qa` +
  `TAXONOMY_VERSION_OVERRIDE=scb-2026-11-20-v2-proposed-qa` +
  `QA_PROPOSED_TAXONOMY_ENABLED=1`.
- No category becomes public until the product owner signs the manifest and a new official
  version is published through the existing seed/adoption path.

## 8. Verdict

The proposed bank is structurally complete, code-compatible, and reviewable. It covers the
main retail families in all 24 sectors and adds 81 high-value proposed families. It is **not**
evidence of 100% assortment coverage. The audit found several deliberate gaps and overlaps,
most importantly fresh produce/eggs in food, EV/motorcycle scope in automotive, and the
01/02/23 and 07/08/09 ownership boundaries. These are listed for human approval rather than
silently patched into an already-reviewed dataset.
