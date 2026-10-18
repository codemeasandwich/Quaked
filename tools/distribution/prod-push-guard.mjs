/** Local convenience guard; the GitHub update ruleset is the enforcing boundary.
 * The dedicated promotion App updates Prod through its audited API controller.
 */
import {readFileSync} from 'node:fs';
for(const line of readFileSync(0,'utf8').trim().split('\n')){
 if(!line)continue;
 const fields=line.trim().split(/\s+/);
 if(fields.length!==4)throw Error('Malformed Git pre-push input');
 if(fields[2]==='refs/heads/Prod')throw Error('Direct pushes to Prod are forbidden. Use the release promotion controller with an explicit Dev commit.');
}
