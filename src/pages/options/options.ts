import { $, onRefresh, refreshAll, reload, state } from './shell.ts';
import { renderResumes, wireResumeInput, wireResumes } from './resume.ts';
import { renderProfile, wireProfile } from './profile.ts';
import { renderAllRecords, renderEducation, renderHistory, renderSkills, wireRecordLists } from './records.ts';
import { renderAnswers, wireAnswers } from './answers.ts';
import { renderContribute, wireContribute } from './contribute.ts';
import { renderSettings, wireSettings } from './settings.ts';

const TABS = ['resume', 'profile', 'answers', 'contribute', 'settings'] as const;
type Tab = (typeof TABS)[number];

function showTab(tab: Tab): void {
  for (const name of TABS) {
    $(`panel-${name}`).hidden = name !== tab;
    document.querySelector(`.tab[data-tab="${name}"]`)?.setAttribute('aria-selected', String(name === tab));
  }
  location.hash = tab;
}

async function boot(): Promise<void> {
  await reload();

  onRefresh(renderProfile);
  onRefresh(renderHistory);
  onRefresh(renderEducation);
  onRefresh(renderSkills);
  onRefresh(renderResumes);
  onRefresh(renderAllRecords);
  onRefresh(renderAnswers);
  onRefresh(renderSettings);
  onRefresh(renderContribute);

  wireResumeInput();
  wireResumes();
  wireProfile();
  wireRecordLists();
  wireAnswers();
  wireContribute();
  wireSettings();

  await refreshAll();

  $('tabs').addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest('.tab') as HTMLElement | null;
    if (tab?.dataset.tab) showTab(tab.dataset.tab as Tab);
  });

  const requested = location.hash.replace('#', '') as Tab;
  showTab(TABS.includes(requested) ? requested : (state().resumes.length ? 'answers' : 'resume'));
}

void boot();
