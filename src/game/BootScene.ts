import Phaser from 'phaser';
import { t } from '../ui/strings';

const ART = import.meta.env.BASE_URL + 'assets/art/';

export class BootScene extends Phaser.Scene {
  private logo?: Phaser.GameObjects.Image;
  private tile?: Phaser.GameObjects.Image;
  private label?: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('logo', ART + 'logo.png');
    this.load.image('ground_mars_2', ART + 'ground_mars_2.png');
  }

  create(): void {
    this.tile = this.add.image(0, 0, 'ground_mars_2').setScale(0.5);
    this.logo = this.add.image(0, 0, 'logo').setScale(0.75);
    this.label = this.add
      .text(0, 0, t('boot.ready'), {
        fontFamily: 'Atkinson Hyperlegible, sans-serif',
        fontSize: '20px',
        color: '#f4ede7',
        align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5, 0);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  private layout(): void {
    if (!this.logo || !this.tile || !this.label) return;
    const cx = this.scale.width / 2;
    const logoH = this.logo.displayHeight;
    const tileH = this.tile.displayHeight;
    const gap = 16;
    const total = logoH + tileH + gap * 2 + this.label.height;
    let y = (this.scale.height - total) / 2;

    this.logo.setPosition(cx, y + logoH / 2);
    y += logoH + gap;
    this.tile.setPosition(cx, y + tileH / 2);
    y += tileH + gap;
    this.label.setPosition(cx, y);
  }
}
