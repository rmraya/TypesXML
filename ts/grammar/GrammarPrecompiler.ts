/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { XMLSchemaParser } from "../schema/XMLSchemaParser";
import { Catalog } from "../Catalog";
import { XMLSchemaGrammar } from "../schema/XMLSchemaGrammar";
import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

export class GrammarPrecompiler {
    private catalog: Catalog;
    private schemaParser: XMLSchemaParser;

    constructor(catalogPath: string) {
        this.catalog = new Catalog(catalogPath);
        this.schemaParser = XMLSchemaParser.getInstance();
        this.schemaParser.setCatalog(this.catalog);
    }

    async serializeXMLSchema(): Promise<boolean> {
        console.log('Processing xml.xsd (W3C XML namespace schema)...');
        
        try {
            const xmlSchemaPath = resolve(__dirname, '../../catalog/xml/xml.xsd');
            console.log('   Source: ' + xmlSchemaPath);
            
            const xmlGrammar = this.schemaParser.parseSchema(xmlSchemaPath, 'http://www.w3.org/XML/1998/namespace');
            
            if (xmlGrammar) {
                const serialized = xmlGrammar.toJSON();
                const outputPath = resolve(__dirname, 'xml-namespace.json');
                
                writeFileSync(outputPath, JSON.stringify(serialized, null, 2));
                console.log('   Serialized to: ' + outputPath);
                console.log('   Contains ' + serialized.elementNames.length + ' elements, ' + serialized.typeNames.length + ' types');

                return true;
            } else {
                console.log('   Failed to parse xml.xsd');
                return false;
            }
        } catch (error) {
            console.log(`   Error: ${(error as Error).message}`);
            return false;
        }
    }

    async serializeXMLSchemaSchema(): Promise<boolean> {
        console.log('Processing XMLSchema.xsd (XML Schema definition)...');
        
        try {
            const xmlSchemaPath = resolve(__dirname, '../../catalog/xml/XMLSchema.xsd');
            console.log('   Source: ' + xmlSchemaPath);
            
            const schemaGrammar = this.schemaParser.parseSchema(xmlSchemaPath, 'http://www.w3.org/2001/XMLSchema');
            
            if (schemaGrammar) {
                const serialized = schemaGrammar.toJSON();
                const outputPath = resolve(__dirname, 'xmlschema-namespace.json');
                
                writeFileSync(outputPath, JSON.stringify(serialized, null, 2));
                console.log('   Serialized to: ' + outputPath);
                console.log('   Contains ' + serialized.elementNames.length + ' elements, ' + serialized.typeNames.length + ' types');
                
                return true;
            } else {
                console.log('   Failed to parse XMLSchema.xsd');
                return false;
            }
        } catch (error) {
            console.log('   Error: ' + (error as Error).message);
            return false;
        }
    }

    async precompileAll(): Promise<void> {
        console.log('Grammar Pre-compilation Tool');
        console.log('================================');
        console.log('Pre-compiling fundamental XML schemas...\n');
        
        const results: boolean[] = [];
        
        results.push(await this.serializeXMLSchema());
        results.push(await this.serializeXMLSchemaSchema());
        // Note: DTD pre-compilation skipped - using runtime skip logic instead
        // DTDs like datatypes.dtd and XMLSchema.dtd contain parameter entities
        // that make them unsuitable for standalone pre-compilation
        
        console.log('\nSummary:');
        const successful = results.filter(r => r).length;
        const total = results.length;
        
        if (successful === total) {
            console.log('Successfully pre-compiled ' + successful + '/' + total + ' schemas');
            console.log('DTD loading optimized with runtime skip logic');
            console.log('Pre-compiled grammars ready for runtime use!');
        } else {
            console.log('Pre-compiled ' + successful + '/' + total + ' schemas');
            console.log('Some schemas failed - they will be skipped at runtime');
        }
    }
}

if (require.main === module) {
    const catalogPath = resolve(__dirname, '../../catalog/catalog.xml');
    const precompiler = new GrammarPrecompiler(catalogPath);
    
    precompiler.precompileAll().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}