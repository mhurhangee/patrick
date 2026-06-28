import { Button } from '@patrick/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@patrick/ui/components/dropdown-menu';
import {
  ArrowLeftRight,
  ArrowUpDown,
  BringToFront,
  ChevronDown,
  type LucideIcon,
  PanelLeft,
  PanelRight,
  RotateCcw,
  RotateCw,
  Settings2,
  SendToBack,
  WrapText,
} from 'lucide-react';
import { keepFocus } from '../shared';

/** The image fields the toolbar needs (a structural subset of the editor's). */
export interface ToolbarImageContext {
  wrapType: string;
  displayMode: string;
  cssFloat: string | null;
}

const WRAP_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'inline', label: 'In line with text', icon: WrapText },
  { value: 'wrapRight', label: 'Float left', icon: PanelLeft },
  { value: 'wrapLeft', label: 'Float right', icon: PanelRight },
  { value: 'behind', label: 'Behind text', icon: SendToBack },
  { value: 'inFront', label: 'In front of text', icon: BringToFront },
];

const TRANSFORMS: { value: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV'; label: string; icon: LucideIcon }[] = [
  { value: 'rotateCW', label: 'Rotate right', icon: RotateCw },
  { value: 'rotateCCW', label: 'Rotate left', icon: RotateCcw },
  { value: 'flipH', label: 'Flip horizontal', icon: ArrowLeftRight },
  { value: 'flipV', label: 'Flip vertical', icon: ArrowUpDown },
];

function resolveWrap(ctx: ToolbarImageContext): string {
  if (ctx.displayMode === 'inline') return 'inline';
  if (ctx.displayMode === 'float' && ctx.cssFloat === 'left') return 'wrapRight';
  if (ctx.displayMode === 'float' && ctx.cssFloat === 'right') return 'wrapLeft';
  return ctx.wrapType;
}

export interface ImageGroupProps {
  imageContext: ToolbarImageContext;
  onImageWrapType: (wrapType: string) => void;
  onImageTransform: (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => void;
  onOpenImageProperties: () => void;
}

/** Contextual image controls — appear in the format band when an image is selected. */
export function ImageGroup({
  imageContext,
  onImageWrapType,
  onImageTransform,
  onOpenImageProperties,
}: ImageGroupProps) {
  const wrapValue = resolveWrap(imageContext);
  const WrapIcon = (WRAP_OPTIONS.find((o) => o.value === wrapValue) ?? WRAP_OPTIONS[0]).icon;

  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" tooltip="Text wrapping" onMouseDown={keepFocus}>
            <WrapIcon />
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={wrapValue} onValueChange={onImageWrapType}>
            {WRAP_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                <o.icon className="size-4" />
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" tooltip="Rotate / flip" onMouseDown={keepFocus}>
            <RotateCw />
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TRANSFORMS.map((tr) => (
            <DropdownMenuItem key={tr.value} onSelect={() => onImageTransform(tr.value)}>
              <tr.icon className="size-4" />
              {tr.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon-sm" tooltip="Image properties" onMouseDown={keepFocus} onClick={onOpenImageProperties}>
        <Settings2 />
      </Button>
    </div>
  );
}
