import { useStorage } from '@nhost/react';
import { useMutation, gql } from '@apollo/client';

const INSERT_CHAT = gql`
  mutation InsertChat($userId: uuid!, $fileId: uuid!, $fileName: String!) {
    insert_chats_one(object: { 
      user_id: $userId, 
      file_id: $fileId, 
      file_name: $fileName,
      status: "processing"
    }) { id }
  }
`;

export function FileUpload({ userId }) {
  const { upload } = useStorage();
  const [insertChat] = useMutation(INSERT_CHAT);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Upload to Nhost Storage (S3)
    const { fileMetadata, error } = await upload({ file });

    if (error) {
      alert("Upload failed: " + error.message);
      return;
    }

    // 2. Save reference in your 'chats' table
    await insertChat({
      variables: { 
        userId, 
        fileId: fileMetadata.id, 
        fileName: file.name 
      }
    });

    // 3. Call your server.py with the fileId
    // Your server.py will use this ID to download the file from Nhost
    console.log("File stored with ID:", fileMetadata.id);
  };

  return <input type="file" onChange={handleFileChange} accept=".pdf" />;
}