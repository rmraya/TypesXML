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

// Core classes
export { CData } from "./CData";
export { Catalog } from "./Catalog";
export { Constants } from "./Constants";
export { ContentHandler } from "./ContentHandler";
export { DOMBuilder } from "./DOMBuilder";
export { FileReader } from "./FileReader";
export { Indenter } from "./Indenter";
export { ProcessingInstruction } from "./ProcessingInstruction";
export { RelaxNGParser } from "./RelaxNGParser";
export { SAXParser } from "./SAXParser";
export type { ParseSourceOptions, StreamParseOptions } from "./SAXParser";
export { TextNode } from "./TextNode";
export { XMLAttribute } from "./XMLAttribute";
export { XMLCanonicalizer } from "./XMLCanonicalizer";
export { XMLComment } from "./XMLComment";
export { XMLDeclaration } from "./XMLDeclaration";
export { XMLDocument } from "./XMLDocument";
export { XMLDocumentType } from "./XMLDocumentType";
export { XMLElement } from "./XMLElement";
export { XMLNode } from "./XMLNode";
export { XMLUtils } from "./XMLUtils";
export { XMLWriter } from "./XMLWriter";

// DTD classes
export { AttDecl } from "./dtd/AttDecl";
export { AttListDecl } from "./dtd/AttListDecl";
export { Cardinality, ContentModel, ContentModelType } from "./dtd/ContentModel";
export { DTDParser } from "./dtd/DTDParser";
export { DTDChoice } from "./dtd/dtdChoice";
export { DTDChoiceModel } from "./dtd/DTDChoiceModel";
export type { DTDContentModel } from "./dtd/DTDContentModel";
export { DTDContentModelParser } from "./dtd/DTDContentModelParser";
export { DTDContentModelTokenizer } from "./dtd/DTDContentModelTokenizer";
export type { DTDToken } from "./dtd/DTDContentModelTokenizer";
export { DTDElementNameParticle } from "./dtd/DTDElementNameParticle";
export { DTDGrammar } from "./dtd/DTDGrammar";
export { DTDName } from "./dtd/dtdName";
export { DTDPCData } from "./dtd/dtdPCData";
export { DTDSequenceModel } from "./dtd/DTDSequenceModel";
export { DTDSecuence } from "./dtd/dtdSecuence";
export { ElementDecl } from "./dtd/ElementDecl";
export { EntityDecl } from "./dtd/EntityDecl";
export { NotationDecl } from "./dtd/NotationDecl";
export { ContentParticleType } from "./dtd/contentParticle";
export type { ContentParticle } from "./dtd/contentParticle";

// Grammar classes
export { AttributeInfo, AttributeUse, GrammarType, ValidationContext, ValidationError, ValidationResult, ValidationWarning } from "./grammar/Grammar";
export type { Grammar } from "./grammar/Grammar";