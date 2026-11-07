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

export const CategoriesPage = () => {
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    void fetch('/categories')
      .then((response) => response.json() as Promise<CategoriesResponse>)
      .then((body) => {
        setCategories(body.categories);
      });
  }, []);

  return (
    <ul aria-label="Categories">
      {categories.map((row) => (
        <li key={row.category}>
          <span>{row.agreementRate === undefined ? noProposalsYetText : agreementRateText(row.agreementRate)}</span>
          <button type="button" role="switch" aria-checked={row.mode === 'automatic'}>
            {row.category}
          </button>
        </li>
      ))}
    </ul>
  );
};
