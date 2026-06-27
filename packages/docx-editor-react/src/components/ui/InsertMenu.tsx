/**
 * InsertMenu — the toolbar's "Insert" dropdown (image, table, breaks, table of
 * contents, watermark, text direction). Replaces the old TitleBar menu bar's
 * Insert/Format menus; built on the @patrick/ui DropdownMenu primitive.
 */

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@patrick/ui/components/dropdown-menu";
import { Button } from "@patrick/ui/components/button";
import {
	ChevronDown,
	Grid3x3,
	Image as ImageIcon,
	ListOrdered,
	Minus,
	PilcrowLeft,
	PilcrowRight,
	Plus,
	Rows2,
	SeparatorHorizontal,
	Stamp,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n";
import type { FormattingAction } from "../Toolbar";
import { TableGridInline } from "./TableGridInline";

export interface InsertMenuProps {
	disabled?: boolean;
	onFormat?: (action: FormattingAction) => void;
	onRefocusEditor?: () => void;
	onInsertImage?: () => void;
	onInsertTable?: (rows: number, columns: number) => void;
	showTableInsert?: boolean;
	onInsertPageBreak?: () => void;
	onInsertSectionBreakNextPage?: () => void;
	onInsertSectionBreakContinuous?: () => void;
	onInsertTOC?: () => void;
	onWatermark?: () => void;
}

export function InsertMenu({
	disabled = false,
	onFormat,
	onRefocusEditor,
	onInsertImage,
	onInsertTable,
	showTableInsert = true,
	onInsertPageBreak,
	onInsertSectionBreakNextPage,
	onInsertSectionBreakContinuous,
	onInsertTOC,
	onWatermark,
}: InsertMenuProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const hasBreaks =
		!!onInsertPageBreak ||
		!!onInsertSectionBreakNextPage ||
		!!onInsertSectionBreakContinuous;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					disabled={disabled}
					className="text-muted-foreground"
					onMouseDown={(e) => e.preventDefault()}
				>
					<Plus />
					{t("toolbar.insert")}
					<ChevronDown />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				onCloseAutoFocus={(e) => {
					// Return focus to the editor (not the trigger) so the selection is
					// restored after an action — mirrors onRefocusEditor elsewhere.
					e.preventDefault();
					onRefocusEditor?.();
				}}
			>
				{onInsertImage && (
					<DropdownMenuItem onSelect={() => onInsertImage()}>
						<ImageIcon />
						{t("toolbar.image")}
					</DropdownMenuItem>
				)}
				{showTableInsert && onInsertTable && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Grid3x3 />
							{t("toolbar.table")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="p-2">
							<TableGridInline
								onInsert={(rows, cols) => {
									onInsertTable(rows, cols);
									setOpen(false);
								}}
							/>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}
				{hasBreaks && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<SeparatorHorizontal />
							{t("toolbar.break")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{onInsertPageBreak && (
								<DropdownMenuItem onSelect={() => onInsertPageBreak()}>
									<SeparatorHorizontal />
									{t("toolbar.pageBreak")}
								</DropdownMenuItem>
							)}
							{onInsertSectionBreakNextPage && (
								<DropdownMenuItem onSelect={() => onInsertSectionBreakNextPage()}>
									<Minus />
									{t("toolbar.sectionBreakNextPage")}
								</DropdownMenuItem>
							)}
							{onInsertSectionBreakContinuous && (
								<DropdownMenuItem
									onSelect={() => onInsertSectionBreakContinuous()}
								>
									<Rows2 />
									{t("toolbar.sectionBreakContinuous")}
								</DropdownMenuItem>
							)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}
				<DropdownMenuItem
					disabled={!onInsertTOC}
					onSelect={() => onInsertTOC?.()}
				>
					<ListOrdered />
					{t("toolbar.tableOfContents")}
				</DropdownMenuItem>
				{onWatermark && (
					<DropdownMenuItem onSelect={() => onWatermark()}>
						<Stamp />
						{t("toolbar.watermark")}
					</DropdownMenuItem>
				)}
				{onFormat && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onFormat("setLtr")}>
							<PilcrowLeft />
							{t("toolbar.leftToRight")}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onFormat("setRtl")}>
							<PilcrowRight />
							{t("toolbar.rightToLeft")}
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
