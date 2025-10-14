/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *******************************************************************************/

export class Constants {

    static readonly DOCUMENT_NODE: number = 0;
    static readonly ELEMENT_NODE: number = 1;
    static readonly ATTRIBUTE_NODE: number = 2;
    static readonly CDATA_SECTION_NODE: number = 3;
    static readonly COMMENT_NODE: number = 4;
    static readonly PROCESSING_INSTRUCTION_NODE: number = 5;
    static readonly TEXT_NODE: number = 6;
    static readonly ENTITY_DECL_NODE: number = 7;
    static readonly XML_DECLARATION_NODE: number = 8;
    static readonly ATTRIBUTE_LIST_DECL_NODE: number = 9;
    static readonly DOCUMENT_TYPE_NODE: number = 10;

    // constants for DTD parser

    static readonly ATTRIBUTE_DECL_NODE: number = 11;
    static readonly ELEMENT_DECL_NODE: number = 12;
    static readonly INTERNAL_SUBSET_NODE: number = 13;
    static readonly NOTATION_DECL_NODE: number = 14;
}