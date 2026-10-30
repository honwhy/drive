export interface AppSettings {
  readonly sound: boolean;
  readonly sensors: boolean;
  readonly haptics: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: true,
  sensors: true,
  haptics: false,
};
