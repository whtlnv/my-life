import { useEffect, useState } from 'react';

interface CategoryRow {
  category: string;
  mode: 'advise' | 'automatic';
  agreementRate?: number;
}

interface CategoriesResponse {
  categories: CategoryRow[];
}

export const agreementRateText = (rate: number) => `${String(Math.round(rate * 100))}% agreement`;

export const noProposalsYetText = 'no proposals yet';

const rateText = (rate: number | undefined) => (rate === undefined ? noProposalsYetText : agreementRateText(rate));

export const CategoriesPage = () => {
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const loadCategories = () =>
    fetch('/categories')
      .then((response) => response.json() as Promise<CategoriesResponse>)
      .then((body) => {
        setCategories(body.categories);
      });

  useEffect(() => {
    void loadCategories();
  }, []);

  const flipMode = (row: CategoryRow) => {
    const mode = row.mode === 'automatic' ? 'advise' : 'automatic';
    void fetch(`/categories/${row.category}/mode`, { method: 'PUT', body: JSON.stringify({ mode }) }).then(
      loadCategories,
    );
  };

  return (
    <ul aria-label="Categories">
      {categories.map((row) => (
        <li key={row.category}>
          <span>{rateText(row.agreementRate)}</span>
          <button
            type="button"
            role="switch"
            aria-checked={row.mode === 'automatic'}
            onClick={() => {
              flipMode(row);
            }}
          >
            {row.category}
          </button>
        </li>
      ))}
    </ul>
  );
};
