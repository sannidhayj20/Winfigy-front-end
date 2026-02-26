import { useQuery, gql } from '@apollo/client';

const GET_MY_CHATS = gql`
  query GetMyChats {
    chats(order_by: { created_at: desc }) {
      id
      file_name
      status
      analysis_result
      # This joins to Nhost Storage metadata automatically
      file_id
    }
  }
`;

export function ChatHistory() {
  const { data, loading } = useQuery(GET_MY_CHATS);

  if (loading) return <p>Loading history...</p>;

  return (
    <div>
      {data.chats.map(chat => (
        <div key={chat.id} className="border p-4 mb-2">
          <h4>{chat.file_name}</h4>
          <p>Status: {chat.status}</p>
          {chat.analysis_result && <pre>{chat.analysis_result}</pre>}
        </div>
      ))}
    </div>
  );
}