/**
 * DrawingML shapes (`wps:wsp`) and text boxes — preset shape types,
 * fill, outline, shape text body, transform.
 */

import type { ColorValue } from '../colors';
import type { ImageSize, ImagePosition, ImageWrap, ImageTransform } from './image';
import type { Paragraph } from './paragraph';

/**
 * Shape types
 */
export type ShapeType =
  // Basic shapes
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rtTriangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'heptagon'
  | 'octagon'
  | 'decagon'
  | 'dodecagon'
  | 'star4'
  | 'star5'
  | 'star6'
  | 'star7'
  | 'star8'
  | 'star10'
  | 'star12'
  | 'star16'
  | 'star24'
  | 'star32'
  // Lines and connectors
  | 'line'
  | 'straightConnector1'
  | 'bentConnector2'
  | 'bentConnector3'
  | 'bentConnector4'
  | 'bentConnector5'
  | 'curvedConnector2'
  | 'curvedConnector3'
  | 'curvedConnector4'
  | 'curvedConnector5'
  // Arrows
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'leftRightArrow'
  | 'upDownArrow'
  | 'quadArrow'
  | 'leftRightUpArrow'
  | 'bentArrow'
  | 'uturnArrow'
  | 'leftUpArrow'
  | 'bentUpArrow'
  | 'curvedRightArrow'
  | 'curvedLeftArrow'
  | 'curvedUpArrow'
  | 'curvedDownArrow'
  | 'stripedRightArrow'
  | 'notchedRightArrow'
  | 'homePlate'
  | 'chevron'
  | 'rightArrowCallout'
  | 'downArrowCallout'
  | 'leftArrowCallout'
  | 'upArrowCallout'
  | 'leftRightArrowCallout'
  | 'quadArrowCallout'
  | 'circularArrow'
  // Flowchart
  | 'flowChartProcess'
  | 'flowChartAlternateProcess'
  | 'flowChartDecision'
  | 'flowChartInputOutput'
  | 'flowChartPredefinedProcess'
  | 'flowChartInternalStorage'
  | 'flowChartDocument'
  | 'flowChartMultidocument'
  | 'flowChartTerminator'
  | 'flowChartPreparation'
  | 'flowChartManualInput'
  | 'flowChartManualOperation'
  | 'flowChartConnector'
  | 'flowChartOffpageConnector'
  | 'flowChartPunchedCard'
  | 'flowChartPunchedTape'
  | 'flowChartSummingJunction'
  | 'flowChartOr'
  | 'flowChartCollate'
  | 'flowChartSort'
  | 'flowChartExtract'
  | 'flowChartMerge'
  | 'flowChartOnlineStorage'
  | 'flowChartDelay'
  | 'flowChartMagneticTape'
  | 'flowChartMagneticDisk'
  | 'flowChartMagneticDrum'
  | 'flowChartDisplay'
  // Callouts
  | 'wedgeRectCallout'
  | 'wedgeRoundRectCallout'
  | 'wedgeEllipseCallout'
  | 'cloudCallout'
  | 'borderCallout1'
  | 'borderCallout2'
  | 'borderCallout3'
  | 'accentCallout1'
  | 'accentCallout2'
  | 'accentCallout3'
  | 'callout1'
  | 'callout2'
  | 'callout3'
  | 'accentBorderCallout1'
  | 'accentBorderCallout2'
  | 'accentBorderCallout3'
  // Other
  | 'actionButtonBlank'
  | 'actionButtonHome'
  | 'actionButtonHelp'
  | 'actionButtonInformation'
  | 'actionButtonBackPrevious'
  | 'actionButtonForwardNext'
  | 'actionButtonBeginning'
  | 'actionButtonEnd'
  | 'actionButtonReturn'
  | 'actionButtonDocument'
  | 'actionButtonSound'
  | 'actionButtonMovie'
  | 'irregularSeal1'
  | 'irregularSeal2'
  | 'frame'
  | 'halfFrame'
  | 'corner'
  | 'diagStripe'
  | 'chord'
  | 'arc'
  | 'bracketPair'
  | 'bracePair'
  | 'leftBracket'
  | 'rightBracket'
  | 'leftBrace'
  | 'rightBrace'
  | 'can'
  | 'cube'
  | 'bevel'
  | 'donut'
  | 'noSmoking'
  | 'blockArc'
  | 'foldedCorner'
  | 'smileyFace'
  | 'heart'
  | 'lightningBolt'
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'snip1Rect'
  | 'snip2SameRect'
  | 'snip2DiagRect'
  | 'snipRoundRect'
  | 'round1Rect'
  | 'round2SameRect'
  | 'round2DiagRect'
  | 'plaque'
  | 'teardrop'
  | 'mathPlus'
  | 'mathMinus'
  | 'mathMultiply'
  | 'mathDivide'
  | 'mathEqual'
  | 'mathNotEqual'
  | 'gear6'
  | 'gear9'
  | 'funnel'
  | 'pieWedge'
  | 'pie'
  | 'leftCircularArrow'
  | 'leftRightCircularArrow'
  | 'swooshArrow'
  | 'textBox';

/**
 * Shape fill type
 */
export interface ShapeFill {
  type: 'none' | 'solid' | 'gradient' | 'pattern' | 'picture';
  /** Solid fill color */
  color?: ColorValue;
  /** Gradient stops for gradient fill */
  gradient?: {
    type: 'linear' | 'radial' | 'rectangular' | 'path';
    angle?: number;
    stops: Array<{
      position: number; // 0-100000
      color: ColorValue;
    }>;
  };
}

/**
 * Shape outline/stroke
 */
export interface ShapeOutline {
  /** Line width in EMUs */
  width?: number;
  /** Line color */
  color?: ColorValue;
  /** Line style */
  style?:
    | 'solid'
    | 'dot'
    | 'dash'
    | 'lgDash'
    | 'dashDot'
    | 'lgDashDot'
    | 'lgDashDotDot'
    | 'sysDot'
    | 'sysDash'
    | 'sysDashDot'
    | 'sysDashDotDot';
  /** Line cap */
  cap?: 'flat' | 'round' | 'square';
  /** Line join */
  join?: 'bevel' | 'miter' | 'round';
  /** Head arrow */
  headEnd?: {
    type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';
    width?: 'sm' | 'med' | 'lg';
    length?: 'sm' | 'med' | 'lg';
  };
  /** Tail arrow */
  tailEnd?: {
    type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'arrow';
    width?: 'sm' | 'med' | 'lg';
    length?: 'sm' | 'med' | 'lg';
  };
}

/**
 * Text body inside a shape
 */
export interface ShapeTextBody {
  /** Text direction */
  vertical?: boolean;
  /** Rotation */
  rotation?: number;
  /** Anchor/vertical alignment */
  anchor?: 'top' | 'middle' | 'bottom' | 'distributed' | 'justified';
  /** Anchor center */
  anchorCenter?: boolean;
  /** Auto fit */
  autoFit?: 'none' | 'normal' | 'shape';
  /** Text margins */
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** Paragraphs inside the shape */
  content: Paragraph[];
}

/**
 * Shape/drawing object (wps:wsp)
 */
export interface Shape {
  type: 'shape';
  /** Shape type preset */
  shapeType: ShapeType;
  /** Unique ID */
  id?: string;
  /** Name */
  name?: string;
  /** Size in EMUs */
  size: ImageSize;
  /** Position for floating shapes */
  position?: ImagePosition;
  /** Wrap settings */
  wrap?: ImageWrap;
  /** Fill */
  fill?: ShapeFill;
  /** Outline/stroke */
  outline?: ShapeOutline;
  /** Transform */
  transform?: ImageTransform;
  /** Text content inside the shape */
  textBody?: ShapeTextBody;
  /** Custom geometry points */
  customGeometry?: string;
}

/**
 * Text box (floating text container)
 */
export interface TextBox {
  type: 'textBox';
  /** Unique ID */
  id?: string;
  /** Size */
  size: ImageSize;
  /** Position */
  position?: ImagePosition;
  /** Wrap settings */
  wrap?: ImageWrap;
  /** Fill */
  fill?: ShapeFill;
  /** Outline */
  outline?: ShapeOutline;
  /** Text content */
  content: Paragraph[];
  /** Internal margins */
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}
