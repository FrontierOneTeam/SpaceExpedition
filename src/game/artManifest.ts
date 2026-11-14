// The 34 art files the game expects, with canvas sizes from SPEC 11.1.
export interface ArtFile {
  file: string;
  width: number;
  height: number;
}

const sized = (names: string[], width: number, height: number): ArtFile[] =>
  names.map((name) => ({ file: `${name}.png`, width, height }));

export const ART_MANIFEST: readonly ArtFile[] = [
  ...sized(
    [
      'habitat',
      'solar_panel',
      'battery',
      'oxygen_maker',
      'greenhouse',
      'ice_mine',
      'soil_digger',
      'parts_factory',
      'research_lab',
      'reactor',
      'landing_pad_rocket',
    ],
    256,
    320,
  ),
  ...sized(['soil_shelter'], 512, 480),
  ...sized(
    ['ground_mars_1', 'ground_mars_2', 'ice_tile', 'rock_tile', 'unsurveyed_tile', 'crater_small'],
    256,
    128,
  ),
  ...sized(['ground_moon_set'], 768, 128),
  ...sized(['astronaut_sheet'], 768, 640),
  ...sized(['mission_control'], 576, 192),
  ...sized(
    [
      'icon_power',
      'icon_air',
      'icon_food',
      'icon_parts',
      'icon_soil',
      'icon_water',
      'icon_research',
      'icon_no_power',
      'icon_broken',
      'icon_storm',
      'icon_dust',
      'icon_dark',
    ],
    128,
    128,
  ),
  ...sized(['logo'], 192, 192),
];
