export class FindCursor<T> {
  private findDocumentsPromise: Promise<T[]>;
  private documents: T[] | null = null;
  private index: number = 0;

  constructor(documents: Promise<T[]>) {
    this.findDocumentsPromise = documents;
  }

  async toArray(): Promise<T[]> {
    return this.findDocuments();
  }

  async forEach(callback: (doc: T) => void): Promise<void> {
    const docs = await this.findDocuments();

    for (const doc of docs) {
      callback(doc);
    }
    return Promise.resolve();
  }

  hasNext(): boolean {
    if (this.documents === null) throw Error('Error while fetching documents');
    return this.index < this.documents.length;
  }

  async next(): Promise<T | null> {
    const docs = await this.findDocuments();
    return this.hasNext() ? (docs[this.index++] ?? null) : null;
  }

  private async findDocuments(): Promise<T[]> {
    this.documents = await this.findDocumentsPromise;
    return this.documents;
  }
}
