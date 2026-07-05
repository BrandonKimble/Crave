import type { ResultsListItem } from '../read-models/read-model-selectors';

export type SearchResultsBodyAdmissionActiveList = 'primary' | 'secondary';

export type SearchResultsBodyAdmissionRowsByTab = {
  dishes: ResultsListItem[];
  restaurants: ResultsListItem[];
};

type ResolveSearchResultsBodyAdmissionArgs = {
  activeTab: 'dishes' | 'restaurants';
  rowsByTab: SearchResultsBodyAdmissionRowsByTab;
  fullRowsByTab: SearchResultsBodyAdmissionRowsByTab;
  resultsIdentityKey: string | null;
};

export type SearchResultsBodyAdmissionSnapshot = {
  activeList: SearchResultsBodyAdmissionActiveList;
  primaryRows: ResultsListItem[];
  secondaryRows: ResultsListItem[];
  renderRowCount: number;
  mode: 'full' | 'shell';
};

const EMPTY_ROWS: ResultsListItem[] = [];

const resolveActiveRows = ({
  activeTab,
  rowsByTab,
}: {
  activeTab: 'dishes' | 'restaurants';
  rowsByTab: SearchResultsBodyAdmissionRowsByTab;
}): ResultsListItem[] => (activeTab === 'restaurants' ? rowsByTab.restaurants : rowsByTab.dishes);

export const resolveSearchResultsBodyAdmissionPreparationRows = ({
  rowsByTab,
}: {
  activeTab: 'dishes' | 'restaurants';
  rowsByTab: SearchResultsBodyAdmissionRowsByTab;
  resultsIdentityKey: string | null;
}): SearchResultsBodyAdmissionRowsByTab => rowsByTab;

export const resolveSearchResultsBodyAdmission = ({
  activeTab,
  fullRowsByTab,
  resultsIdentityKey,
  rowsByTab,
}: ResolveSearchResultsBodyAdmissionArgs): SearchResultsBodyAdmissionSnapshot => {
  const activeList: SearchResultsBodyAdmissionActiveList =
    activeTab === 'restaurants' ? 'primary' : 'secondary';
  const fullActiveRows = resolveActiveRows({ activeTab, rowsByTab: fullRowsByTab });
  if (fullActiveRows.length === 0 || resultsIdentityKey == null) {
    return {
      activeList,
      mode: 'shell',
      primaryRows: [],
      renderRowCount: 0,
      secondaryRows: [],
    };
  }
  const primaryRows = rowsByTab.restaurants;
  const secondaryRows = rowsByTab.dishes;
  const admittedActiveRows = activeList === 'primary' ? primaryRows : secondaryRows;
  return {
    activeList,
    mode: 'full',
    primaryRows,
    renderRowCount: admittedActiveRows.length,
    secondaryRows,
  };
};
