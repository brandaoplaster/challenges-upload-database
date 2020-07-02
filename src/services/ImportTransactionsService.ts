import { getCustomRepository, getRepository, In } from 'typeorm';

import fs from 'fs';
import csvParse from 'csv-parse';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface TransactionCSV {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(file_path: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const transactions: TransactionCSV[] = [];
    const categories: string[] = [];

    const createReatedStrem = fs.createReadStream(file_path);

    const parsCsvConfig = csvParse({
      from_line: 2,
    });

    const parseCSV = createReatedStrem.pipe(parsCsvConfig);

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cel: string) =>
        cel.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriesExists = await categoryRepository.find({
      where: { title: In(categories) },
    });

    const categoryTitleExists = categoriesExists.map(
      (category: Category) => category.title,
    );

    const addCategory = categories
      .filter(category => !categoryTitleExists.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoryRepository.create(
      addCategory.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(newCategories);

    const fullCategories = [...newCategories, ...categoriesExists];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: fullCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(file_path);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
