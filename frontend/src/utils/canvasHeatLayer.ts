import L from 'leaflet';

/**
 * Pawang AI Canvas Heatmap Layer
 * Inspired by Vladimir Agafonkin's simpleheat & NOAA Water Prediction GIS.
 * Renders smooth, organic, non-boxy continuous density surfaces with zero external API keys.
 */
export interface HeatLayerOptions extends L.LayerOptions {
  minOpacity?: number;
  maxZoom?: number;
  max?: number;
  radius?: number;
  blur?: number;
  gradient?: Record<number, string>;
}

export type HeatLatLngTuple = [number, number, number]; // [lat, lng, intensity]

export class CanvasHeatLayer extends L.Layer {
  private _latlngs: HeatLatLngTuple[];
  public options: HeatLayerOptions;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _circle: HTMLCanvasElement | null = null;
  private _grad: Uint8ClampedArray | null = null;
  private _r: number = 30;
  private _frame: number | null = null;

  constructor(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions) {
    super();
    this._latlngs = latlngs || [];
    this.options = {
      minOpacity: 0.12,
      max: 1.0,
      radius: 38,
      blur: 26,
      gradient: {
        0.15: '#FDE047', // Soft yellow
        0.35: '#FACC15', // Yellow
        0.55: '#FB923C', // Orange
        0.75: '#A855F7', // Purple
        0.95: '#D946EF', // Deep Magenta
      },
      ...options,
    };
  }

  public setLatLngs(latlngs: HeatLatLngTuple[]): this {
    this._latlngs = latlngs;
    return this.redraw();
  }

  public addLatLng(latlng: HeatLatLngTuple): this {
    this._latlngs.push(latlng);
    return this.redraw();
  }

  public setOptions(options: HeatLayerOptions): this {
    L.setOptions(this, options);
    this._initCircle();
    this._initGradient();
    return this.redraw();
  }

  public redraw(): this {
    if (this._canvas && !this._frame && this._map) {
      this._frame = L.Util.requestAnimFrame(this._draw, this);
    }
    return this;
  }

  public onAdd(map: L.Map): this {
    this._map = map;
    if (!this._canvas) {
      this._initCanvas();
    }
    const pane = map.getPanes().overlayPane;
    if (this._canvas) {
      pane.appendChild(this._canvas);
    }

    map.on('moveend', this._reset, this);
    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on('zoomanim', this._animateZoom, this);
    }

    this._reset();
    return this;
  }

  public onRemove(map: L.Map): this {
    const pane = map.getPanes().overlayPane;
    if (this._canvas && pane.contains(this._canvas)) {
      pane.removeChild(this._canvas);
    }

    map.off('moveend', this._reset, this);
    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.off('zoomanim', this._animateZoom, this);
    }
    return this;
  }

  private _initCanvas(): void {
    const canvas = (this._canvas = L.DomUtil.create(
      'canvas',
      'leaflet-heatmap-layer leaflet-layer'
    ));
    canvas.style.transformOrigin = '50% 50%';

    const size = this._map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;

    this._ctx = canvas.getContext('2d');
    this._initCircle();
    this._initGradient();
  }

  private _initCircle(): void {
    const r = this.options.radius || 35;
    const blur = this.options.blur || 25;
    const circle = (this._circle = document.createElement('canvas'));
    const ctx = circle.getContext('2d')!;
    const totalR = (this._r = r + blur);

    circle.width = circle.height = totalR * 2;

    ctx.shadowOffsetX = ctx.shadowOffsetY = totalR * 2;
    ctx.shadowBlur = blur;
    ctx.shadowColor = 'black';

    ctx.beginPath();
    ctx.arc(-totalR, -totalR, r, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }

  private _initGradient(): void {
    const gradCanvas = document.createElement('canvas');
    const ctx = gradCanvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradCanvas.width = 1;
    gradCanvas.height = 256;

    const gradStops = this.options.gradient || {
      0.15: '#FDE047',
      0.35: '#FACC15',
      0.55: '#FB923C',
      0.75: '#A855F7',
      0.95: '#D946EF',
    };

    for (const stop in gradStops) {
      gradient.addColorStop(parseFloat(stop), gradStops[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);
    this._grad = ctx.getImageData(0, 0, 1, 256).data;
  }

  private _reset(): void {
    if (!this._map || !this._canvas) return;
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const size = this._map.getSize();
    if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
      this._canvas.width = size.x;
      this._canvas.height = size.y;
    }

    this._draw();
  }

  private _draw(): void {
    this._frame = null;
    if (!this._ctx || !this._map || !this._circle || !this._grad) return;

    const ctx = this._ctx;
    const size = this._map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    const r = this._r;
    const max = this.options.max || 1.0;
    const minOpacity = this.options.minOpacity ?? 0.12;

    // Project latlngs to container coordinates
    for (let i = 0; i < this._latlngs.length; i++) {
      const p = this._latlngs[i];
      const point = this._map.latLngToContainerPoint([p[0], p[1]]);

      // Skip offscreen points
      if (
        point.x < -r ||
        point.y < -r ||
        point.x > size.x + r ||
        point.y > size.y + r
      ) {
        continue;
      }

      const intensity = Math.min(1.0, Math.max(0.1, p[2] / max));
      ctx.globalAlpha = Math.max(intensity, minOpacity);
      ctx.drawImage(this._circle, point.x - r, point.y - r);
    }

    // Colorize alpha mask with gradient LUT
    const image = ctx.getImageData(0, 0, size.x, size.y);
    const data = image.data;
    const grad = this._grad;

    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i];
      if (alpha > 0) {
        const offset = alpha * 4;
        data[i - 3] = grad[offset];
        data[i - 2] = grad[offset + 1];
        data[i - 1] = grad[offset + 2];
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  private _animateZoom(e: L.ZoomAnimEvent): void {
    if (!this._map || !this._canvas) return;
    const mapInternal = this._map as unknown as {
      _getCenterOffset?: (center: L.LatLng) => L.Point;
      _getMapPanePos?: () => L.Point;
    };
    if (mapInternal._getCenterOffset && mapInternal._getMapPanePos) {
      const scale = this._map.getZoomScale(e.zoom);
      const offset = mapInternal
        ._getCenterOffset(e.center)
        .multiplyBy(-scale)
        .subtract(mapInternal._getMapPanePos());
      L.DomUtil.setTransform(this._canvas, offset, scale);
    }
  }
}

export function createHeatLayer(
  latlngs: HeatLatLngTuple[],
  options?: HeatLayerOptions
): CanvasHeatLayer {
  return new CanvasHeatLayer(latlngs, options);
}
