/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
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

    // RelaxNG Namespace URI
    static readonly RELAXNG_NS_URI: string = 'http://relaxng.org/ns/structure/1.0';
    static readonly RELAXNG_COMPATIBILITY_NS_URI: string = 'http://relaxng.org/ns/compatibility/annotations/1.0';

    // XML Schema instance namespace URI
    static readonly XML_SCHEMA_INSTANCE_NS_URI: string = 'http://www.w3.org/2001/XMLSchema-instance';
}