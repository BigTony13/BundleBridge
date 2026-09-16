const {test}=require('node:test');const assert=require('node:assert/strict');const {parse,format,values,bundleName,bundleFileName,folderLocales,validateBundleBase,buildLocaleTag,localeTagError,appendMissingLocales,mergeLocaleOrder,localeOrderAppended,sortFilesByLocaleOrder,duplicateKeyInfo}=require('../src/properties');
test('Java delimiters, comments, escaped keys, Unicode and continuations',()=>{
 const p=parse('# header\r\na\\ b\\:c :  Hello\\nworld\r\nemoji=\\uD83D\\uDE00\r\nwrapped=one\\\r\n   two\r\nspace value\r\nempty\r\n');
 assert.deepEqual(values(p),{'a b:c':'Hello\nworld',emoji:'😀',wrapped:'onetwo',space:'value',empty:''});assert.equal(p.eol,'\r\n');assert.equal(p.header[0],'# header');
});
test('locale grouping keeps underscore bundle prefixes and unknown language codes',()=>{
 for(const [s,b,l]of [['Content_en_US','Content','en_US'],['Content_ex_MX','Content','ex_MX'],['app_messages_zh_Hant_TW','app_messages','zh_Hant_TW'],['Content','Content',''],['Content_es','Content','es']])assert.deepEqual(bundleName(s+'.properties'),{base:b,locale:l});
 assert.equal(bundleName('readme.txt'),null);
});
test('bundle file names and folder locale discovery',()=>{
 assert.equal(bundleFileName('Messages',''),'Messages.properties');
 assert.equal(bundleFileName('Messages','en_US'),'Messages_en_US.properties');
 assert.deepEqual(folderLocales(['Content_en_US.properties','Content_es_MX.properties','Other.properties','readme.txt']),['','en_US','es_MX']);
 assert.equal(validateBundleBase('Content_en_US'),'Use the bundle base name only, without a locale suffix');
});
test('locale order merges detected locales and sorts panels',()=>{
 assert.deepEqual(mergeLocaleOrder(['de_DE','en_US','es_MX'],['es_MX','en_US']),['es_MX','en_US','de_DE']);
 assert.deepEqual(appendMissingLocales(['es_MX','en_US','de_DE'],['en_US']),['es_MX','en_US','de_DE']);
 assert.equal(localeOrderAppended(['de_DE','es_MX'],['de_DE','es_MX','en_US']),true);
 assert.equal(localeOrderAppended(['es_MX','en_US'],['de_DE','es_MX','en_US']),false);
 const files=[{locale:'en_US'},{locale:'es_MX'},{locale:'de_DE'}];
 assert.deepEqual(sortFilesByLocaleOrder(files,['es_MX','en_US'],f=>f.locale).map(f=>f.locale),['es_MX','en_US','de_DE']);
});
test('locale tags for new property files',()=>{
 assert.equal(buildLocaleTag({language:'en',region:'US'}),'en_US');
 assert.equal(buildLocaleTag({language:'zh',script:'Hant',region:'TW'}),'zh_Hant_TW');
 assert.equal(buildLocaleTag({language:''}),'');
 assert.equal(localeTagError({language:'en',region:'US'}),null);
 assert.match(localeTagError({language:'english'}),/Language must/);
 assert.match(localeTagError({language:'en',script:'xx'}),/Script must/);
});
test('round trips reserved characters, literal escapes, surrogate pairs and whitespace',()=>{
 const model={entries:[{key:' a:=#!\\.😀',value:'  hello \\u1234 \\ newline\n\t\r\f😀 café  ',comments:['# comment']}],trailing:['! end'],eol:'\n',bom:true};
 for(const unicodeEscape of [true,false])for(const delimiter of ['=',':'])for(const wrapColumn of [0,20,45])for(const wrapAlign of [true,false])for(const wrapAfterNewline of [true,false]){
 const options={unicodeEscape,delimiter,wrapColumn,wrapAlign,wrapAfterNewline};assert.deepEqual(values(parse(format(model,options))),values(model),JSON.stringify(options));
 }
});
test('alignment and grouping use escaped key lengths and exact group names',()=>{
 const p=parse('a.x=1\na.long=2\nab.y=3\n');const out=format(p,{alignment:'group',groupKeys:true});assert.equal(out,'a.long = 2\na.x    = 1\n\nab.y = 3\n');
});
test('format removes blank lines except blankLinesBetweenGroups when groupKeys is on',()=>{
 assert.equal(format(parse('# Header\n\n\na=1\n\n\nb=2\n')),'# Header\na = 1\nb = 2\n');
 assert.equal(format(parse('a.x=1\n\n\na.y=2\n\n\nb.z=3\n'),{groupKeys:true,sortKeys:true}),'a.x = 1\na.y = 2\n\nb.z = 3\n');
 assert.equal(format(parse('a.x=1\n\n\na.y=2\n\n\nb.z=3\n'),{groupKeys:true,sortKeys:true,blankLinesBetweenGroups:2}),'a.x = 1\na.y = 2\n\n\nb.z = 3\n');
 assert.equal(format(parse('a=1\n\n# note\nb=2\n')),'a = 1\n# note\nb = 2\n');
});
test('empty values preserved by default and optionally removed',()=>{assert.equal(format(parse('empty=\n')),'empty = \n');assert.equal(format(parse('empty=\n'),{keepEmptyValues:false}),'');});
test('malformed Unicode is rejected instead of silently corrupted',()=>{assert.throws(()=>parse('a=\\u12xz'),/Malformed/);});
test('duplicate keys remain explicit and effective value is last',()=>{const p=parse('a=1\na=2\n');assert.equal(p.entries.length,2);assert.equal(values(p).a,'2');});
test('duplicateKeyInfo lists unique keys and occurrence counts',()=>{assert.deepEqual(duplicateKeyInfo(parse('a=1\na=2\nb=1\n')),{duplicates:['a'],duplicateCounts:{a:2}});assert.deepEqual(duplicateKeyInfo(parse('x=1\ny=2\n')),{duplicates:[],duplicateCounts:{}});});
test('prototype names are ordinary resource keys',()=>{const p=parse('__proto__=ok\nconstructor=yes\n');assert.equal(values(p).__proto__,'ok');assert.equal(values(parse(format(p))).constructor,'yes');});
test('physical and value newline settings are independent',()=>{assert.equal(format(parse('a=one\\ntwo\n'),{lineEnding:'crlf',valueNewline:'cr'}),'a = one\\rtwo\r\n');});
test('deterministic random semantic round trips across wrapping settings',()=>{
 let seed=123;const chars=['a',' ',':','=','\\','\n','\r','\t','é','😀','#','!'];const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let i=0;i<300;i++){const str=()=>Array.from({length:random()%80},()=>chars[random()%chars.length]).join('');const p={entries:[{key:str(),value:str(),comments:[]}],trailing:[],eol:'\n'};assert.deepEqual(values(parse(format(p,{wrapColumn:10+random()%60,wrapIndent:random()%15,unicodeEscape:!!(random()%2)}))),values(p));}
});

test('Unicode remains valid after UTF-8 encoding at wrap boundaries',()=>{
 const p=parse('emoji=123456789😀😀😀é\n');
 for(let wrapColumn=5;wrapColumn<30;wrapColumn++){const output=format(p,{unicodeEscape:false,wrapColumn,wrapIndent:0});assert.deepEqual(values(parse(Buffer.from(output,'utf8').toString('utf8'))),values(p));}
});
test('generated header is idempotent and original header survives sorting',()=>{const p=parse('# File header\nz=1\na=2\n');const options={generatedHeader:true,sortKeys:true};const first=format(p,options);assert.equal(format(parse(first),options),first);assert.match(first,/^# Generated by BundleBridge\n# File header\na = 2/);});
